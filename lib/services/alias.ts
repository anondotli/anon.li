
import { z } from "zod"
import { randomBytes } from "crypto"
import { getPlanLimits, getEffectiveTier, assertOrgPlanActive, type UserSub } from "@/lib/limits"
import { createLogger } from "@/lib/logger"
import {
    getAliasById,
    getAliases as dbGetAliases,
    countAliases as dbCountAliases,
    deleteAliasById as dbDeleteAlias,
} from "@/lib/data/alias"
import { ownerWhere, assertCanManage, type OwnerScope } from "@/lib/ownership"
import { getUserById, type UserWithSubscriptions } from "@/lib/data/user"
import { getOrgLimitContext } from "@/lib/data/auth"
import { getDomains } from "@/lib/data/domain"
import { getRecipientById, getDefaultRecipient, getRecipientByScopeAndEmail } from "@/lib/data/recipient"
import { prisma } from "@/lib/prisma"
import { Prisma, type Recipient } from "@prisma/client"
import { ErrorCodes } from "@/lib/api-response"
import { ValidationError, NotFoundError, ForbiddenError, ConflictError, UpgradeRequiredError } from "@/lib/api-error-utils"
import { LOCAL_PART_PATTERN } from "@/lib/validations/alias"

const logger = createLogger("AliasService");

const RESERVED_ALIASES = new Set([
    "about", "abuse", "account", "accounts", "admin", "administrator", "api", "auth",
    "billing", "blog", "bounce", "careers", "compliance", "contact", "dev", "developer",
    "feedback", "hello", "help", "hi", "hostmaster", "hr", "info", "invoice", "it",
    "jobs", "legal", "login", "mail", "mailer-daemon", "marketing", "media", "news",
    "newsletter", "no-reply", "noc", "noreply", "office", "post", "postmaster", "press",
    "privacy", "register", "reply", "report", "root", "sales", "security", "signup",
    "staff", "status", "support", "sysadmin", "team", "terms", "verify", "webmaster", "welcome",
    "ceo", "cfo", "cio", "coo", "cto", "cmo", "ciso",
    "president", "vicepresident", "vp", "director", "manager", "management",
    "founder", "owner", "co-founder", "cofounder", "exec", "executive",
    "board", "investors", "shareholders",
    "accounting", "finance", "audit", "auditor", "payroll",
    "purchasing", "orders", "ordering", "logistics", "shipping", "returns",
    "refund", "refunds", "payments", "payment", "receipts",
    "recruit", "recruitment", "hiring", "talent", "people",
    "partners", "partnership", "affiliate", "affiliates",
    "franchise", "brand", "branding", "design", "ux", "ui",
    "app", "apps", "bot", "bots", "robot", "chatbot",
    "code", "git", "svn", "repo", "source",
    "computer", "server", "servers", "cloud", "network", "system", "systems",
    "database", "db", "sql", "data", "analytics", "metrics",
    "dns", "ftp", "http", "https", "imap", "pop", "smtp", "ssh", "ssl", "tls",
    "www", "web", "site", "website", "domain", "url",
    "maintenance", "ops", "operations", "engineering", "eng", "tech",
    "prod", "production", "stage", "staging", "test", "testing", "beta", "demo",
    "bug", "bugs", "error", "errors", "exception",
    "alert", "alerts", "notification", "notifications", "notify",
    "announce", "announcement", "announcements", "broadcast",
    "moderator", "mod", "moderation", "admin-security", "trust", "safety",
    "password", "passwords", "secret", "secrets", "credential", "credentials",
    "verify", "verification", "auth", "authentication", "authorize",
    "gdpr", "dpo", "ccpa", "lawyer", "attorney", "corporate",
    "unsubscribe", "optout", "remove", "delete",
    "all", "everyone", "everybody", "public",
    "user", "users", "username", "client", "clients",
    "guest", "guests", "customer", "member", "members",
    "unknown", "anonymous", "anon",
    "null", "none", "void", "undefined", "nan",
    "example", "sample", "foobar",
    "official", "service", "community", "forum", "forums",
    "group", "groups", "mailing", "list", "lists",
]);

/**
 * Shared domains operated by anon.li. Reserved local parts (role addresses like
 * admin@, abuse@) only protect these — on a user's own verified domain the user
 * is the operator and may claim any local part.
 */
const SHARED_ALIAS_DOMAINS = new Set(["anon.li"])

// Admin-managed additions (ReservedAlias table, edited in /admin/settings) are
// cached briefly so alias creation doesn't hit the DB for the list every time.
const RESERVED_ALIAS_CACHE_TTL_MS = 60_000
let reservedAliasCache: { aliases: Set<string>; expiresAt: number } | null = null

async function getAdminReservedAliases(): Promise<Set<string>> {
    const now = Date.now()
    if (reservedAliasCache && reservedAliasCache.expiresAt > now) {
        return reservedAliasCache.aliases
    }
    const rows = await prisma.reservedAlias.findMany({ select: { alias: true } })
    const aliases = new Set(rows.map((row) => row.alias.toLowerCase()))
    reservedAliasCache = { aliases, expiresAt: now + RESERVED_ALIAS_CACHE_TTL_MS }
    return aliases
}

/** Test hook: drop the cached admin reserved-alias list. */
export function clearReservedAliasCache() {
    reservedAliasCache = null
}

async function isReservedLocalPart(localPart: string, domain: string): Promise<boolean> {
    if (!SHARED_ALIAS_DOMAINS.has(domain)) return false
    const normalized = localPart.toLowerCase()
    if (RESERVED_ALIASES.has(normalized)) return true
    return (await getAdminReservedAliases()).has(normalized)
}

/** Message for ErrorCodes.ORG_KEY_GENERATION_MISMATCH on alias metadata writes. */
const ORG_KEY_GENERATION_MISMATCH_MESSAGE = "Team encryption key changed — please retry"

/**
 * Org alias labels/notes are encrypted with the team's org vault key. Before
 * storing new org ciphertext, lock the org row (serializing with a key
 * rotation, which re-encrypts alias metadata under the same lock) and require
 * the generation the client encrypted with to be the current one — otherwise a
 * stale cached key would write a label nobody can ever decrypt. Mirrors the
 * Form owner-key check in FormService.
 */
async function assertCurrentOrgKeyGeneration(
    tx: Prisma.TransactionClient,
    organizationId: string,
    orgKeyGeneration: number | undefined,
) {
    const rows = await tx.$queryRaw<Array<{ orgKeyGeneration: number }>>`
        SELECT "org_key_generation" AS "orgKeyGeneration"
        FROM "organizations"
        WHERE "id" = ${organizationId}
        FOR UPDATE
    `
    const currentGeneration = rows[0]?.orgKeyGeneration ?? 0
    if (currentGeneration < 1) {
        throw new ValidationError("Team encryption key is not set up yet")
    }
    if (orgKeyGeneration !== currentGeneration) {
        throw new ConflictError(ORG_KEY_GENERATION_MISMATCH_MESSAGE, ErrorCodes.ORG_KEY_GENERATION_MISMATCH)
    }
}

/** Owner-facing refusal when re-enabling an alias an admin took down. */
const ALIAS_TAKEN_DOWN_MESSAGE =
    "This alias was disabled by anon.li for violating our terms of service and can't be re-enabled."

/**
 * Write an alias row; when the write re-enables it, the caller passes
 * `takenDownAt: null` in `where`, so a concurrent admin takedown can't be
 * undone — the conditional update matches nothing (P2025) → ForbiddenError.
 */
async function updateAliasRow(
    client: Pick<Prisma.TransactionClient, "alias">,
    args: Prisma.AliasUpdateArgs,
    reactivating: boolean,
) {
    try {
        return await client.alias.update(args)
    } catch (error) {
        if (reactivating && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            throw new ForbiddenError(ALIAS_TAKEN_DOWN_MESSAGE)
        }
        throw error
    }
}

/** True when an org-scope write stores (non-null) alias metadata ciphertext. */
function writesOrgCiphertext(
    scope: OwnerScope,
    data: { encryptedLabel?: string | null; encryptedNote?: string | null },
): scope is OwnerScope & { organizationId: string } {
    return scope.organizationId !== null
        && (typeof data.encryptedLabel === "string" || typeof data.encryptedNote === "string")
}

const createAliasSchema = z.object({
    localPart: z.string().optional(),
    domain: z.string().min(1, "Domain is required"),
    format: z.enum(["RANDOM", "CUSTOM"]).default("CUSTOM"),
    recipientId: z.string().optional(),
    recipientEmail: z.string().optional(),
}).refine(data => {
    if (data.format === "CUSTOM" && !data.localPart) {
        return false;
    }
    return true;
}, {
    message: "Username is required for custom aliases",
    path: ["localPart"]
});

export class AliasService {

    static async getAliases(scope: OwnerScope, options?: { limit?: number; offset?: number }) {
        return await dbGetAliases(scope, options)
    }

    static async countAliases(scope: OwnerScope) {
        return await dbCountAliases(scope)
    }

    static async createAlias(scope: OwnerScope, data: {
        localPart?: string, domain: string, format?: "RANDOM" | "CUSTOM",
        recipientId?: string, recipientEmail?: string, recipientIds?: string[],
        encryptedLabel?: string | null, encryptedNote?: string | null,
        /** Required with org-scope ciphertext: the team key generation used. */
        orgKeyGeneration?: number
    }) {
        const result = createAliasSchema.safeParse(data)
        if (!result.success) {
            const message = result.error.issues[0]?.message || "Validation failed"
            throw new ValidationError(message)
        }

        const { domain, format } = result.data
        let { localPart } = result.data

        const user = await this._validateUserAccess(scope.userId)

        // Limit values derive from the OWNING plan: in org scope from the org's
        // own subscription (Business), not the creating member's personal plan;
        // usage counts are already pooled across the org via ownerWhere(scope).
        const limitContext = scope.organizationId
            ? await getOrgLimitContext(scope.organizationId)
            : user

        // Purchase-first Teams: an unsubscribed org is a zero-capacity workspace.
        if (scope.organizationId) assertOrgPlanActive(limitContext, "aliases", "alias_random")

        // Resolve recipients: prefer recipientIds array, fall back to single recipientId/recipientEmail.
        // Recipient lookups are scope-aware (ownerWhere), so org scope resolves the org's shared recipients.
        const recipients = await this._resolveRecipients(
            scope, user.email || "", data.recipientIds, data.recipientId, data.recipientEmail
        )

        if (recipients.length === 0) {
            throw new ValidationError("No valid recipient available. Please add a recipient first.")
        }

        localPart = await this._generateOrValidateAlias(scope, user, limitContext, domain, format, localPart)

        if (!localPart) throw new ValidationError("Failed to generate alias")

        await this._validateDomainAccess(scope, domain)

        const email = `${localPart}@${domain}`

        // Use a serializable transaction to prevent TOCTOU race conditions
        return await prisma.$transaction(async (tx) => {
            if (writesOrgCiphertext(scope, data)) {
                await assertCurrentOrgKeyGeneration(tx, scope.organizationId, data.orgKeyGeneration)
            }

            const existing = await tx.alias.findUnique({ where: { email } })
            if (existing) {
                throw new ConflictError("Alias already taken on this domain")
            }

            // Re-check limits inside the transaction (counted within the owner scope;
            // limit values come from limitContext, which is the org plan in org scope).
            const currentCount = await tx.alias.count({
                where: { ...ownerWhere(scope), format },
            })
            const { random: randomLimit, custom: customLimit } = getPlanLimits(limitContext)
            const limit = format === "CUSTOM" ? customLimit : randomLimit
            if (limit !== -1 && currentCount >= limit) {
                const currentTier = getEffectiveTier(limitContext)
                throw new UpgradeRequiredError(
                    format === "CUSTOM"
                        ? `Custom alias limit reached (${limit}). Upgrade to add more.`
                        : `Random alias limit reached (${limit}). Upgrade to add more.`,
                    {
                        scope: format === "CUSTOM" ? "alias_custom" : "alias_random",
                        currentTier,
                        suggestedTier: currentTier === "pro" ? "pro" : currentTier === "plus" ? "pro" : "plus",
                        currentValue: currentCount,
                        limitValue: limit,
                    }
                )
            }

            const alias = await tx.alias.create({
                data: {
                    email,
                    localPart,
                    domain,
                    userId: user.id,
                    organizationId: scope.organizationId,
                    // Legacy field: set to primary recipient for backward compat
                    recipientId: recipients[0]!.id,
                    format: format,
                    encryptedLabel: data.encryptedLabel || null,
                    encryptedNote: data.encryptedNote || null,
                }
            })

            // Create AliasRecipient join rows
            await tx.aliasRecipient.createMany({
                data: recipients.map((r, i) => ({
                    aliasId: alias.id,
                    recipientId: r.id,
                    ordinal: i,
                    isPrimary: i === 0,
                })),
            })

            return alias
        }, { isolationLevel: "Serializable" })
    }

    private static async _validateRecipient(scope: OwnerScope, recipientId?: string, _fallbackEmail?: string, recipientEmail?: string) {
        // If recipientEmail is provided, resolve to a recipient by email within scope
        if (recipientEmail) {
            const recipient = await getRecipientByScopeAndEmail(scope, recipientEmail)
            if (!recipient) {
                throw new NotFoundError("Recipient not found")
            }
            if (!recipient.verified) {
                throw new ValidationError("Recipient email is not verified")
            }
            return { recipient, recipientEmail: recipient.email }
        }

        // If recipientId is provided, validate it is within scope and verified
        if (recipientId) {
            const recipient = await getRecipientById(recipientId, scope)
            if (!recipient) {
                throw new NotFoundError("Recipient not found")
            }
            if (!recipient.verified) {
                throw new ValidationError("Recipient email is not verified")
            }
            return { recipient, recipientEmail: recipient.email }
        }

        // If no recipientId, try to use the default recipient
        const defaultRecipient = await getDefaultRecipient(scope)
        if (defaultRecipient) {
            return { recipient: defaultRecipient, recipientEmail: defaultRecipient.email }
        }

        // No default recipient found
        return { recipient: null, recipientEmail: "" }
    }

    private static async _validateUserAccess(userId: string) {
        const user = await getUserById(userId)
        if (!user) throw new NotFoundError("User not found")

        if (user.banned || user.banAliasCreation) {
            throw new ForbiddenError(user.banned
                ? (user.banReason || "Your account has been suspended.")
                : "Alias creation has been restricted for your account.")
        }
        return user
    }

    private static async _validateDomainAccess(scope: OwnerScope, domain: string) {
        // anon.li is the main shared domain - always allowed
        if (domain === "anon.li") {
            return
        }

        // For custom domains, check ownership (personal or org) and verification.
        // Org members can use any domain the org has verified (Track D).
        const scopedDomains = await getDomains(scope)
        const ownedDomain = scopedDomains.find((d) => d.domain === domain)

        if (!ownedDomain) {
            throw new ForbiddenError("Domain not associated with this account")
        }
        if (!ownedDomain.verified) {
            throw new ValidationError("Domain not verified")
        }
    }

    private static async _generateOrValidateAlias(
        scope: OwnerScope,
        user: UserWithSubscriptions,
        limitContext: UserSub,
        domain: string,
        format: "RANDOM" | "CUSTOM",
        localPart?: string
    ) {
        // Early-exit limit check (authoritative re-check is inside the create
        // transaction). Limits come from the OWNING plan (the org's in org
        // scope) and usage is a pooled DB count — never the member's own plan.
        const { random: randomLimit, custom: customLimit } = getPlanLimits(limitContext)
        const countFormat = (f: "RANDOM" | "CUSTOM") =>
            prisma.alias.count({ where: { ...ownerWhere(scope), format: f } })

        if (format === "CUSTOM") {
            // Validate Local Part Format
            // Must be lowercase alphanumeric with optional dots (not consecutive, not at start/end)
            // RFC 5321 compliant: no consecutive dots, no leading/trailing dots
            if (!localPart || !LOCAL_PART_PATTERN.test(localPart)) {
                throw new ValidationError("Username can only contain lowercase letters, numbers, and single dots (not at start/end)")
            }

            // Length limits
            if (localPart.length > 64) {
                throw new ValidationError("Username must be 64 characters or less")
            }

            // Reserved Check (shared anon.li domains only)
            if (await isReservedLocalPart(localPart, domain)) {
                logger.info(`Reserved alias attempted`, { localPart, domain, userId: user.id });
                throw new ValidationError(`This alias is reserved: "${localPart}"`)
            }

            // Limit Check
            const currentCustomCount = customLimit === -1 ? 0 : await countFormat("CUSTOM")
            if (customLimit !== -1 && currentCustomCount >= customLimit) {
                const currentTier = getEffectiveTier(limitContext)
                throw new UpgradeRequiredError(
                    `Custom alias limit reached (${customLimit}). Upgrade to add more.`,
                    {
                        scope: "alias_custom",
                        currentTier,
                        suggestedTier: currentTier === "pro" ? "pro" : currentTier === "plus" ? "pro" : "plus",
                        currentValue: currentCustomCount,
                        limitValue: customLimit,
                    }
                )
            }
            return localPart
        } else {
            // RANDOM
            const currentRandomCount = randomLimit === -1 ? 0 : await countFormat("RANDOM")
            if (randomLimit !== -1 && currentRandomCount >= randomLimit) {
                const currentTier = getEffectiveTier(limitContext)
                throw new UpgradeRequiredError(
                    `Random alias limit reached (${randomLimit}). Upgrade to add more.`,
                    {
                        scope: "alias_random",
                        currentTier,
                        suggestedTier: currentTier === "pro" ? "pro" : currentTier === "plus" ? "pro" : "plus",
                        currentValue: currentRandomCount,
                        limitValue: randomLimit,
                    }
                )
            }

            // Generate Random Local Part
            let unique = false
            let attempts = 0
            let generatedPart = ""

            while (!unique && attempts < 10) {
                // Generate 10 char random string using CSPRNG with rejection sampling
                const charset = "abcdefghijklmnopqrstuvwxyz0123456789" // length 36
                const maxValid = 252 // largest multiple of 36 <= 256, avoids modulo bias
                const chars: string[] = []
                while (chars.length < 10) {
                    const bytes = randomBytes(10 - chars.length + 2) // request a few extra to reduce iterations
                    for (const b of bytes) {
                        if (b < maxValid && chars.length < 10) {
                            chars.push(charset[b % 36]!)
                        }
                    }
                }
                generatedPart = chars.join('')

                // Check uniqueness on this specific domain
                const exists = await prisma.alias.findUnique({
                    where: { email: `${generatedPart}@${domain}` }
                })
                if (!exists) unique = true
                attempts++
            }
            if (!unique) throw new ValidationError("Failed to generate unique alias")
            return generatedPart
        }
    }

    static async toggleAlias(scope: OwnerScope, aliasId: string) {
        const alias = await getAliasById(aliasId, scope)
        if (!alias) {
            throw new NotFoundError("Alias not found")
        }
        // Toggling a shared org alias's forwarding affects the team → admin+.
        assertCanManage(alias, scope)

        // Pausing is always allowed; re-enabling is refused while an admin
        // takedown is in force (conditional on takenDownAt in the write itself).
        const reactivating = !alias.active
        if (reactivating && alias.takenDownAt) {
            throw new ForbiddenError(ALIAS_TAKEN_DOWN_MESSAGE)
        }
        return await updateAliasRow(prisma, {
            where: reactivating ? { id: aliasId, takenDownAt: null } : { id: aliasId },
            data: { active: !alias.active }
        }, reactivating)
    }

    static async deleteAlias(scope: OwnerScope, aliasId: string) {
        const alias = await getAliasById(aliasId, scope)
        if (!alias) {
            throw new NotFoundError("Alias not found")
        }
        // Deleting a shared org alias is destructive for the team → admin+.
        assertCanManage(alias, scope)

        return await dbDeleteAlias(aliasId, scope)
    }

    static async updateAlias(
        scope: OwnerScope,
        aliasId: string,
        data: {
            encryptedLabel?: string | null; encryptedNote?: string | null;
            clearLegacyLabel?: boolean; clearLegacyNote?: boolean;
            recipientId?: string; recipientEmail?: string;
            recipientIds?: string[];
            /** Idempotent set (not a toggle); applied atomically with the rest. */
            active?: boolean;
            /** Required with org-scope ciphertext: the team key generation used. */
            orgKeyGeneration?: number;
        }
    ) {
        const alias = await getAliasById(aliasId, scope)
        if (!alias) {
            throw new NotFoundError("Alias not found")
        }

        // Repointing a shared org alias's forwarding (or pausing it) affects the
        // whole team → admin+, matching toggleAlias/deleteAlias. Label/note
        // edits stay open to every member.
        // `active` only counts when it actually changes, so full-object PATCH
        // clients resending the current value can still edit labels as members.
        const changesActive = data.active !== undefined && data.active !== alias.active
        const changesRouting = data.recipientIds !== undefined
            || data.recipientId !== undefined
            || data.recipientEmail !== undefined
            || changesActive
        if (changesRouting) {
            assertCanManage(alias, scope)
        }

        const activeUpdate = changesActive ? { active: data.active } : {}
        // Owners can't re-enable an alias an admin took down (see toggleAlias).
        const reactivating = changesActive && data.active === true
        if (reactivating && alias.takenDownAt) {
            throw new ForbiddenError(ALIAS_TAKEN_DOWN_MESSAGE)
        }
        const aliasWhere = reactivating ? { id: aliasId, takenDownAt: null } : { id: aliasId }
        const checkOrgKey = writesOrgCiphertext(scope, data)
            ? (tx: Prisma.TransactionClient) =>
                assertCurrentOrgKeyGeneration(tx, scope.organizationId!, data.orgKeyGeneration)
            : null

        // If updating recipients (array), replace the full list
        if (data.recipientIds !== undefined) {
            const recipients = await this._validateRecipientIds(scope, data.recipientIds)
            if (recipients.length === 0) {
                throw new ValidationError("At least one valid recipient is required")
            }

            return await prisma.$transaction(async (tx) => {
                if (checkOrgKey) await checkOrgKey(tx)
                // Replace join table rows
                await tx.aliasRecipient.deleteMany({ where: { aliasId } })
                await tx.aliasRecipient.createMany({
                    data: recipients.map((r, i) => ({
                        aliasId,
                        recipientId: r.id,
                        ordinal: i,
                        isPrimary: i === 0,
                    })),
                })

                // Update alias: legacy recipientId + metadata
                return await updateAliasRow(tx, {
                    where: aliasWhere,
                    data: {
                        recipientId: recipients[0]!.id,
                        ...activeUpdate,
                        ...(data.encryptedLabel !== undefined && { encryptedLabel: data.encryptedLabel }),
                        ...(data.encryptedNote !== undefined && { encryptedNote: data.encryptedNote }),
                        ...(data.clearLegacyLabel && { legacyLabel: null }),
                        ...(data.clearLegacyNote && { legacyNote: null }),
                    },
                }, reactivating)
            })
        }

        // Single recipient update (backward compat)
        if (data.recipientId !== undefined || data.recipientEmail !== undefined) {
            const { recipient } = await this._validateRecipient(scope, data.recipientId, undefined, data.recipientEmail)
            if (!recipient) {
                throw new ValidationError("Invalid recipient")
            }

            return await prisma.$transaction(async (tx) => {
                if (checkOrgKey) await checkOrgKey(tx)
                // Update join table: replace all with single recipient
                await tx.aliasRecipient.deleteMany({ where: { aliasId } })
                await tx.aliasRecipient.create({
                    data: {
                        aliasId,
                        recipientId: recipient.id,
                        ordinal: 0,
                        isPrimary: true,
                    },
                })

                return await updateAliasRow(tx, {
                    where: aliasWhere,
                    data: {
                        ...(data.encryptedLabel !== undefined && { encryptedLabel: data.encryptedLabel }),
                        ...(data.encryptedNote !== undefined && { encryptedNote: data.encryptedNote }),
                        ...(data.clearLegacyLabel && { legacyLabel: null }),
                        ...(data.clearLegacyNote && { legacyNote: null }),
                        ...activeUpdate,
                        recipientId: recipient.id,
                    },
                }, reactivating)
            })
        }

        const update = {
            where: aliasWhere,
            data: {
                ...activeUpdate,
                ...(data.encryptedLabel !== undefined && { encryptedLabel: data.encryptedLabel }),
                ...(data.encryptedNote !== undefined && { encryptedNote: data.encryptedNote }),
                ...(data.clearLegacyLabel && { legacyLabel: null }),
                ...(data.clearLegacyNote && { legacyNote: null }),
            }
        }
        if (!checkOrgKey) {
            return await updateAliasRow(prisma, update, reactivating)
        }
        return await prisma.$transaction(async (tx) => {
            await checkOrgKey(tx)
            return await updateAliasRow(tx, update, reactivating)
        })
    }

    /**
     * Get all recipients for an alias via the join table,
     * ordered by ordinal. Falls back to legacy recipientId if no join rows exist.
     */
    static async getAliasRecipients(aliasId: string) {
        const joinRows = await prisma.aliasRecipient.findMany({
            where: { aliasId },
            include: { recipient: true },
            orderBy: { ordinal: "asc" as const },
        })

        if (joinRows.length > 0) {
            return joinRows.map((row: { recipient: Recipient; isPrimary: boolean; ordinal: number }) => ({
                id: row.recipient.id,
                email: row.recipient.email,
                pgpPublicKey: row.recipient.pgpPublicKey,
                isPrimary: row.isPrimary,
                ordinal: row.ordinal,
            }))
        }

        // Fallback: legacy single recipient
        const alias = await prisma.alias.findUnique({
            where: { id: aliasId },
            include: { recipient: { select: { id: true, email: true, pgpPublicKey: true } } },
        })
        if (alias?.recipient) {
            return [{
                id: alias.recipient.id,
                email: alias.recipient.email,
                pgpPublicKey: alias.recipient.pgpPublicKey,
                isPrimary: true,
                ordinal: 0,
            }]
        }

        return []
    }

    /**
     * Resolve recipients from various input formats.
     * Priority: recipientIds array > single recipientId/email > default recipient.
     */
    private static async _resolveRecipients(
        scope: OwnerScope,
        fallbackEmail: string,
        recipientIds?: string[],
        recipientId?: string,
        recipientEmail?: string,
    ): Promise<Recipient[]> {
        // Multi-recipient path
        if (recipientIds && recipientIds.length > 0) {
            return this._validateRecipientIds(scope, recipientIds)
        }

        // Single-recipient path (backward compat)
        const { recipient } = await this._validateRecipient(scope, recipientId, fallbackEmail, recipientEmail)
        return recipient ? [recipient] : []
    }

    /**
     * Validate an array of recipient IDs: all must belong to the user and be verified.
     */
    private static async _validateRecipientIds(scope: OwnerScope, requestedIds: string[]): Promise<Recipient[]> {
        // Dedupe (keeping first-occurrence order): a repeated id would otherwise
        // hit the (aliasId, recipientId) unique index in createMany → 500.
        const recipientIds = [...new Set(requestedIds)]
        if (recipientIds.length === 0) {
            throw new ValidationError("At least one recipient is required")
        }

        // Enforce max recipients per alias based on the OWNING plan: in org scope
        // from the org's own subscription, else the acting user's.
        const limitContext = scope.organizationId
            ? await getOrgLimitContext(scope.organizationId)
            : await getUserById(scope.userId)
        if (!limitContext) throw new NotFoundError("User not found")
        const { recipientsPerAlias } = getPlanLimits(limitContext)
        if (recipientsPerAlias !== undefined && recipientIds.length > recipientsPerAlias) {
            const currentTier = getEffectiveTier(limitContext)
            throw new UpgradeRequiredError(
                `Maximum ${recipientsPerAlias} recipients per alias on your plan.`,
                {
                    scope: "alias_recipients_per_alias",
                    currentTier,
                    suggestedTier: currentTier === "pro" ? "pro" : currentTier === "plus" ? "pro" : "plus",
                    currentValue: recipientIds.length,
                    limitValue: recipientsPerAlias,
                }
            )
        }

        const recipients = await prisma.recipient.findMany({
            where: {
                id: { in: recipientIds },
                ...ownerWhere(scope),
            },
        })

        // Check all IDs were found
        const foundIds = new Set(recipients.map((r) => r.id))
        for (const id of recipientIds) {
            if (!foundIds.has(id)) {
                throw new NotFoundError(`Recipient not found: ${id}`)
            }
        }

        // Check all are verified
        for (const r of recipients) {
            if (!r.verified) {
                throw new ValidationError(`Recipient ${r.email} is not verified`)
            }
        }

        // Return in the order specified by recipientIds
        const recipientMap = new Map(recipients.map((r) => [r.id, r]))
        return recipientIds.map((id) => recipientMap.get(id)!)
    }
}
