
import { z } from "zod"
import { randomBytes } from "crypto"
import { getPlanLimits, getEffectiveTier } from "@/lib/limits"
import { createLogger } from "@/lib/logger"
import {
    getAliasById,
    getAliasesByUserId,
    deleteAliasById as dbDeleteAlias,
} from "@/lib/data/alias"
import { getUserById, type UserWithSubscriptions } from "@/lib/data/user"
import { getDomainsByUserId } from "@/lib/data/domain"
import { getRecipientById, getDefaultRecipientByUserId, getRecipientByUserIdAndEmail } from "@/lib/data/recipient"
import { prisma } from "@/lib/prisma"
import type { Alias, Recipient } from "@prisma/client"
import { ValidationError, NotFoundError, ForbiddenError, ConflictError, UpgradeRequiredError } from "@/lib/api-error-utils"

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

    static async getAliases(userId: string) {
        return await getAliasesByUserId(userId)
    }

    static async createAlias(userId: string, data: {
        localPart?: string, domain: string, format?: "RANDOM" | "CUSTOM",
        recipientId?: string, recipientEmail?: string, recipientIds?: string[],
        encryptedLabel?: string | null, encryptedNote?: string | null
    }) {
        const result = createAliasSchema.safeParse(data)
        if (!result.success) {
            const message = result.error.issues[0]?.message || "Validation failed"
            throw new ValidationError(message)
        }

        const { domain, format } = result.data
        let { localPart } = result.data

        const user = await this._validateUserAccess(userId)

        // Resolve recipients: prefer recipientIds array, fall back to single recipientId/recipientEmail
        const recipients = await this._resolveRecipients(
            userId, user.email || "", data.recipientIds, data.recipientId, data.recipientEmail
        )

        if (recipients.length === 0) {
            throw new ValidationError("No valid recipient available. Please add a recipient first.")
        }

        const aliases = await getAliasesByUserId(userId)
        localPart = await this._generateOrValidateAlias(user, aliases, domain, format, localPart)

        if (!localPart) throw new ValidationError("Failed to generate alias")

        await this._validateDomainAccess(user, domain)

        const email = `${localPart}@${domain}`

        // Use a serializable transaction to prevent TOCTOU race conditions
        return await prisma.$transaction(async (tx) => {
            const existing = await tx.alias.findUnique({ where: { email } })
            if (existing) {
                throw new ConflictError("Alias already taken on this domain")
            }

            // Re-check limits inside the transaction
            const currentCount = await tx.alias.count({
                where: { userId: user.id, format },
            })
            const { random: randomLimit, custom: customLimit } = getPlanLimits(user)
            const limit = format === "CUSTOM" ? customLimit : randomLimit
            if (limit !== -1 && currentCount >= limit) {
                const currentTier = getEffectiveTier(user)
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

    private static async _validateRecipient(userId: string, recipientId?: string, _fallbackEmail?: string, recipientEmail?: string) {
        // If recipientEmail is provided, resolve to a recipient by email
        if (recipientEmail) {
            const recipient = await getRecipientByUserIdAndEmail(userId, recipientEmail)
            if (!recipient) {
                throw new NotFoundError("Recipient not found")
            }
            if (!recipient.verified) {
                throw new ValidationError("Recipient email is not verified")
            }
            return { recipient, recipientEmail: recipient.email }
        }

        // If recipientId is provided, validate it belongs to this user and is verified
        if (recipientId) {
            const recipient = await getRecipientById(recipientId, userId)
            if (!recipient) {
                throw new NotFoundError("Recipient not found")
            }
            if (recipient.userId !== userId) {
                throw new NotFoundError("Recipient not found")
            }
            if (!recipient.verified) {
                throw new ValidationError("Recipient email is not verified")
            }
            return { recipient, recipientEmail: recipient.email }
        }

        // If no recipientId, try to use the default recipient
        const defaultRecipient = await getDefaultRecipientByUserId(userId)
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

    private static async _validateDomainAccess(user: UserWithSubscriptions, domain: string) {
        // anon.li is the main shared domain - always allowed
        if (domain === "anon.li") {
            return
        }

        // For custom domains, check user ownership and verification
        const userDomains = await getDomainsByUserId(user.id)
        const ownedDomain = userDomains.find((d) => d.domain === domain)

        if (!ownedDomain) {
            throw new ForbiddenError("Domain not associated with your account")
        }
        if (!ownedDomain.verified) {
            throw new ValidationError("Domain not verified")
        }
    }

    private static async _generateOrValidateAlias(
        user: UserWithSubscriptions,
        aliases: Alias[],
        domain: string,
        format: "RANDOM" | "CUSTOM",
        localPart?: string
    ) {
        const { random: randomLimit, custom: customLimit } = getPlanLimits(user)

        if (format === "CUSTOM") {
            // Validate Local Part Format
            // Must be lowercase alphanumeric with optional dots (not consecutive, not at start/end)
            // RFC 5321 compliant: no consecutive dots, no leading/trailing dots
            if (!localPart || !/^[a-z0-9]+(\.[a-z0-9]+)*$/.test(localPart)) {
                throw new ValidationError("Username can only contain lowercase letters, numbers, and single dots (not at start/end)")
            }

            // Length limits
            if (localPart.length > 64) {
                throw new ValidationError("Username must be 64 characters or less")
            }

            // Reserved Check
            if (RESERVED_ALIASES.has(localPart.toLowerCase())) {
                logger.info(`Reserved alias attempted`, { localPart, domain, userId: user.id });
                throw new ValidationError(`This alias is reserved: "${localPart}"`)
            }

            // Limit Check
            const currentCustomCount = aliases.filter((a) => a.format === "CUSTOM").length
            if (customLimit !== -1 && currentCustomCount >= customLimit) {
                const currentTier = getEffectiveTier(user)
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
            const currentRandomCount = aliases.filter((a) => a.format === "RANDOM").length
            if (randomLimit !== -1 && currentRandomCount >= randomLimit) {
                const currentTier = getEffectiveTier(user)
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

    static async toggleAlias(userId: string, aliasId: string) {
        const alias = await getAliasById(aliasId, userId)
        if (!alias || alias.userId !== userId) {
            throw new NotFoundError("Alias not found")
        }

        return await prisma.alias.update({
            where: { id: aliasId },
            data: { active: !alias.active }
        })
    }

    static async deleteAlias(userId: string, aliasId: string) {
        const alias = await getAliasById(aliasId, userId)
        if (!alias || alias.userId !== userId) {
            throw new NotFoundError("Alias not found")
        }

        return await dbDeleteAlias(aliasId, userId)
    }

    static async updateAlias(
        userId: string,
        aliasId: string,
        data: {
            encryptedLabel?: string | null; encryptedNote?: string | null;
            clearLegacyLabel?: boolean; clearLegacyNote?: boolean;
            recipientId?: string; recipientEmail?: string;
            recipientIds?: string[];
        }
    ) {
        const alias = await getAliasById(aliasId, userId)
        if (!alias || alias.userId !== userId) {
            throw new NotFoundError("Alias not found")
        }

        // If updating recipients (array), replace the full list
        if (data.recipientIds !== undefined) {
            const recipients = await this._validateRecipientIds(userId, data.recipientIds)
            if (recipients.length === 0) {
                throw new ValidationError("At least one valid recipient is required")
            }

            return await prisma.$transaction(async (tx) => {
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
                return await tx.alias.update({
                    where: { id: aliasId },
                    data: {
                        recipientId: recipients[0]!.id,
                        ...(data.encryptedLabel !== undefined && { encryptedLabel: data.encryptedLabel }),
                        ...(data.encryptedNote !== undefined && { encryptedNote: data.encryptedNote }),
                        ...(data.clearLegacyLabel && { legacyLabel: null }),
                        ...(data.clearLegacyNote && { legacyNote: null }),
                    },
                })
            })
        }

        // Single recipient update (backward compat)
        if (data.recipientId !== undefined || data.recipientEmail !== undefined) {
            const { recipient } = await this._validateRecipient(userId, data.recipientId, undefined, data.recipientEmail)
            if (!recipient) {
                throw new ValidationError("Invalid recipient")
            }

            return await prisma.$transaction(async (tx) => {
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

                return await tx.alias.update({
                    where: { id: aliasId },
                    data: {
                        ...(data.encryptedLabel !== undefined && { encryptedLabel: data.encryptedLabel }),
                        ...(data.encryptedNote !== undefined && { encryptedNote: data.encryptedNote }),
                        ...(data.clearLegacyLabel && { legacyLabel: null }),
                        ...(data.clearLegacyNote && { legacyNote: null }),
                        recipientId: recipient.id,
                    },
                })
            })
        }

        return await prisma.alias.update({
            where: { id: aliasId },
            data: {
                ...(data.encryptedLabel !== undefined && { encryptedLabel: data.encryptedLabel }),
                ...(data.encryptedNote !== undefined && { encryptedNote: data.encryptedNote }),
                ...(data.clearLegacyLabel && { legacyLabel: null }),
                ...(data.clearLegacyNote && { legacyNote: null }),
            }
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
        userId: string,
        fallbackEmail: string,
        recipientIds?: string[],
        recipientId?: string,
        recipientEmail?: string,
    ): Promise<Recipient[]> {
        // Multi-recipient path
        if (recipientIds && recipientIds.length > 0) {
            return this._validateRecipientIds(userId, recipientIds)
        }

        // Single-recipient path (backward compat)
        const { recipient } = await this._validateRecipient(userId, recipientId, fallbackEmail, recipientEmail)
        return recipient ? [recipient] : []
    }

    /**
     * Validate an array of recipient IDs: all must belong to the user and be verified.
     */
    private static async _validateRecipientIds(userId: string, recipientIds: string[]): Promise<Recipient[]> {
        if (recipientIds.length === 0) {
            throw new ValidationError("At least one recipient is required")
        }

        // Enforce max recipients per alias based on plan
        const user = await getUserById(userId)
        if (!user) throw new NotFoundError("User not found")
        const { recipientsPerAlias } = getPlanLimits(user)
        if (recipientsPerAlias !== undefined && recipientIds.length > recipientsPerAlias) {
            const currentTier = getEffectiveTier(user)
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
                userId,
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
