
import { z } from "zod"
import crypto from "crypto"
import dns from "dns"
import util from "util"
import { prisma } from "@/lib/prisma"
import { getPlanLimits, assertOrgPlanActive } from "@/lib/limits"
import { getOrgLimitContext } from "@/lib/data/auth"
import { getUserById } from "@/lib/data/user"
import { generateDkimKeys } from "@/lib/dkim"
import { createLogger } from "@/lib/logger"
import { Prisma } from "@prisma/client"
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "@/lib/api-error-utils"
import { ownerWhere, assertCanAccess, assertCanManage, isWithinScope, type OwnerScope } from "@/lib/ownership"
import { encryptField } from "@/lib/field-encryption"
import { audit } from "@/lib/services/audit"
import { trackServerEvent } from "@/lib/posthog.server"

const logger = createLogger("DomainService")

const DNS_TIMEOUT = 10_000 // 10s timeout for DNS lookups

const _resolveMx = util.promisify(dns.resolveMx)
const _resolveTxt = util.promisify(dns.resolveTxt)

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("DNS lookup timed out")), ms)
        ),
    ])
}

const resolveMx = (domain: string) => withTimeout(_resolveMx(domain), DNS_TIMEOUT)
const resolveTxt = (domain: string) => withTimeout(_resolveTxt(domain), DNS_TIMEOUT)

const domainSchema = z.object({
    domain: z.string().min(1).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid domain format"),
})

type DomainReader = Pick<Prisma.TransactionClient, "domain">

/**
 * Reject a domain claim when the name is already VERIFIED by anyone (the proven
 * owner keeps it) or already added in this scope. Unverified claims by other
 * owners don't block — otherwise anyone could squat a name they don't control.
 */
async function assertDomainClaimable(db: DomainReader, scope: OwnerScope, domain: string) {
    const existing = await db.domain.findFirst({
        where: {
            domain,
            OR: [{ verified: true }, ownerWhere(scope)],
        },
        select: { verified: true, userId: true, organizationId: true },
    })
    if (!existing) return
    if (isWithinScope(existing, scope)) {
        throw new ConflictError("This domain is already added to your account")
    }
    throw new ConflictError("This domain is already verified by another account")
}

export class DomainService {

    static async createDomain(scope: OwnerScope, rawDomain: string) {
        // Domain names are case-insensitive; store and compare them lowercased.
        const domain = rawDomain.trim().toLowerCase()

        // Validate domain format
        const result = domainSchema.safeParse({ domain })
        if (!result.success) {
            const message = result.error.issues[0]?.message || "Validation failed"
            throw new ValidationError(message)
        }

        // Block reserved domains (the shared apex and any of its subdomains)
        if (domain === "anon.li" || domain.endsWith(".anon.li")) {
            throw new ValidationError("This domain is reserved and cannot be added")
        }

        // Check plan limits. In org scope the limit derives from the org's own
        // plan (Business), not the creating member's personal plan; the count is
        // already pooled across the org via ownerWhere(scope).
        const user = await getUserById(scope.userId)

        if (!user) {
            throw new NotFoundError("User not found")
        }

        const limitContext = scope.organizationId
            ? await getOrgLimitContext(scope.organizationId)
            : user

        // Purchase-first Teams: an unsubscribed org is a zero-capacity workspace.
        if (scope.organizationId) assertOrgPlanActive(limitContext, "custom domains", "alias_domains")

        const { domains: domainsLimit } = getPlanLimits(limitContext)

        // Early-exit optimization (authoritative check is inside the transaction)
        const currentDomainCount = await prisma.domain.count({ where: ownerWhere(scope) })
        if (currentDomainCount >= domainsLimit) {
            const message = domainsLimit === 0
                ? "Custom domains are available on Plus and Pro plans."
                : `Domain limit reached (${domainsLimit}). Upgrade to increase.`
            throw new ForbiddenError(message)
        }

        // Early-exit duplicate check (authoritative re-check is inside the transaction)
        await assertDomainClaimable(prisma, scope, domain)

        // Generate DKIM keys outside the transaction (async I/O)
        const dkimKeys = await generateDkimKeys()
        const verificationToken = crypto.randomBytes(24).toString('hex')

        // Serializable transaction: re-check count and create atomically
        const newDomain = await prisma.$transaction(async (tx) => {
            const currentCount = await tx.domain.count({ where: ownerWhere(scope) })
            if (currentCount >= domainsLimit) {
                const message = domainsLimit === 0
                    ? "Custom domains are available on Plus and Pro plans."
                    : `Domain limit reached (${domainsLimit}). Upgrade to increase.`
                throw new ForbiddenError(message)
            }
            await assertDomainClaimable(tx, scope, domain)
            const encryptedPrivateKey = encryptField(dkimKeys.privateKey, "DKIM_ENCRYPTION_KEY")

            return tx.domain.create({
                data: {
                    domain,
                    userId: scope.userId,
                    organizationId: scope.organizationId,
                    verificationToken,
                    dkimPrivateKey: encryptedPrivateKey,
                    dkimPublicKey: dkimKeys.publicKey,
                    dkimSelector: 'default',
                    dkimVerified: false
                }
            })
        }, { isolationLevel: "Serializable" })

        logger.info("Domain created", { userId: scope.userId, domain })

        // Product analytics (no domain string in properties — PII-light).
        trackServerEvent(scope.userId, "domain_added", {
            is_org_domain: scope.organizationId !== null,
        })

        return newDomain
    }

    static async verifyDomain(scope: OwnerScope, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        // Cross-tenant guard: 404 out-of-scope domains rather than revealing them.
        assertCanAccess(domain, scope)

        let dnsResult: {
            verified: boolean
            ownershipVerified: boolean
            mxVerified: boolean
            spfVerified: boolean
            dkimVerified: boolean
            dnsVerified: boolean
        }
        try {
            // 1. MX Verification
            const mxRecords = await resolveMx(domain.domain).catch(() => [])
            const hasMx = mxRecords.some(record => record.exchange === "mx.anon.li")

            // 2. Ownership & SPF Verification
            const rootTxtRecords = await resolveTxt(domain.domain).catch(() => [])

            const expectedOwnershipTxt = `anon.li=${domain.verificationToken}`
            const hasOwnership = rootTxtRecords.some(record => {
                const txt = Array.isArray(record) ? record.join('') : record
                return txt === expectedOwnershipTxt
            })

            const hasSpf = rootTxtRecords.some(record => {
                const txt = Array.isArray(record) ? record.join('') : record
                return txt.includes("v=spf1") && txt.includes("include:anon.li")
            })

            // 3. DKIM Verification
            let hasDkim = false
            if (domain.dkimPublicKey && domain.dkimSelector) {
                const dkimHost = `${domain.dkimSelector}._domainkey.${domain.domain}`
                const dkimTxtRecords = await resolveTxt(dkimHost).catch(() => [])

                const cleanKey = domain.dkimPublicKey
                    ?.replace(/-----BEGIN PUBLIC KEY-----/g, "")
                    .replace(/-----END PUBLIC KEY-----/g, "")
                    .replace(/[\n\r\s]/g, "")
                    .trim()

                hasDkim = dkimTxtRecords.some(record => {
                    const txt = (Array.isArray(record) ? record.join('') : record)
                        .replace(/\s+/g, '')
                    return txt.includes("v=DKIM1") && cleanKey && txt.includes(cleanKey)
                })
            }

            const dnsVerified = hasMx && hasSpf && (domain.dkimPublicKey ? hasDkim : true)
            const verified = hasOwnership && dnsVerified
            dnsResult = {
                verified,
                ownershipVerified: hasOwnership,
                mxVerified: hasMx,
                spfVerified: hasSpf,
                dkimVerified: hasDkim,
                dnsVerified
            }
        } catch (error) {
            logger.error("DNS lookup error during verification", error)
            throw new Error("Failed to verify DNS records. Please try again later.")
        }

        const { verified } = dnsResult
        // Track when a previously-verified domain loses verification so the
        // stale-domain cleanup grants it a grace period (cron-domains.ts).
        const unverifiedAt = verified
            ? null
            : domain.verified ? new Date() : domain.unverifiedAt

        try {
            // Transaction: revoke others, then claim ownership. The partial
            // unique index (domain WHERE verified) allows only one verified row
            // per name, so other owners' rows must be revoked BEFORE this one is
            // marked verified. A concurrent verify of the same name by another
            // owner surfaces as P2002 on that index.
            await prisma.$transaction(async (tx) => {
                if (verified) {
                    // Proof of current DNS control supersedes a stale claim.
                    const superseded = await tx.domain.findMany({
                        where: { domain: domain.domain, id: { not: domainId }, verified: true },
                        select: { id: true, userId: true, organizationId: true },
                    })
                    if (superseded.length > 0) {
                        await tx.domain.updateMany({
                            where: { id: { in: superseded.map((d) => d.id) }, verified: true },
                            data: {
                                verified: false,
                                ownershipVerified: false,
                                unverifiedAt: new Date(),
                            },
                        })
                        // Stop routing mail for this domain to the previous
                        // owner(s) right away instead of for the whole cleanup
                        // grace period. Deactivate (reversible), don't delete;
                        // nothing re-activates them automatically — if the old
                        // owner re-verifies, they re-enable aliases themselves.
                        for (const previous of superseded) {
                            const sameOwner = previous.organizationId
                                ? previous.organizationId === domain.organizationId
                                : domain.organizationId === null && previous.userId === domain.userId
                            if (sameOwner) continue
                            await tx.alias.updateMany({
                                where: previous.organizationId
                                    ? { domain: domain.domain, organizationId: previous.organizationId }
                                    : { domain: domain.domain, userId: previous.userId, organizationId: null },
                                data: { active: false },
                            })
                        }
                    }
                }

                // Record this domain's verification state
                await tx.domain.update({
                    where: { id: domainId },
                    data: {
                        ownershipVerified: dnsResult.ownershipVerified,
                        mxVerified: dnsResult.mxVerified,
                        spfVerified: dnsResult.spfVerified,
                        dkimVerified: dnsResult.dkimVerified,
                        dnsVerified: dnsResult.dnsVerified,
                        verified,
                        unverifiedAt,
                    },
                })
            })
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                throw new ConflictError("This domain was just verified by another account. Please try again.")
            }
            throw error
        }

        logger.info("Domain verification completed", { userId: scope.userId, domainId, verified })

        if (verified && scope.organizationId) {
            void audit({
                action: "org.domain.verify",
                actorId: scope.userId,
                targetId: domainId,
                organizationId: scope.organizationId,
                metadata: { domain: domain.domain },
            })
        }

        return dnsResult
    }

    static async regenerateDkim(scope: OwnerScope, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        // Rotating DKIM breaks signing for the whole team until DNS is updated → admin+.
        assertCanManage(domain, scope)

        const keys = await generateDkimKeys()
        const encryptedPrivateKey = encryptField(keys.privateKey, "DKIM_ENCRYPTION_KEY")

        const updatedDomain = await prisma.domain.update({
            where: { id: domainId },
            data: {
                dkimPrivateKey: encryptedPrivateKey,
                dkimPublicKey: keys.publicKey,
                dkimSelector: "default",
                dkimVerified: false,
            }
        })

        logger.info("DKIM keys regenerated", { userId: scope.userId, domainId })

        return {
            id: updatedDomain.id,
            domain: updatedDomain.domain,
            dkimPublicKey: updatedDomain.dkimPublicKey,
            dkimSelector: updatedDomain.dkimSelector,
            dkimVerified: updatedDomain.dkimVerified
        }
    }

    static async deleteDomain(scope: OwnerScope, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        // Deleting an org domain (and its aliases) is destructive → admin+ in org.
        assertCanManage(domain, scope)

        // Delete domain and associated aliases atomically, within the owner scope.
        await prisma.$transaction([
            prisma.alias.deleteMany({
                where: {
                    domain: domain.domain,
                    ...ownerWhere(scope)
                }
            }),
            prisma.domain.delete({
                where: { id: domainId }
            })
        ])

        logger.info("Domain deleted", { userId: scope.userId, domainId, domain: domain.domain })
    }
}
