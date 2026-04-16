
import { z } from "zod"
import crypto from "crypto"
import dns from "dns"
import util from "util"
import { prisma } from "@/lib/prisma"
import { getPlanLimits } from "@/lib/limits"
import { generateDkimKeys } from "@/lib/dkim"
import { createLogger } from "@/lib/logger"
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/api-error-utils"
import { encryptField } from "@/lib/field-encryption"

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

export class DomainService {

    static async createDomain(userId: string, domain: string) {
        // Validate domain format
        const result = domainSchema.safeParse({ domain })
        if (!result.success) {
            const message = result.error.issues[0]?.message || "Validation failed"
            throw new ValidationError(message)
        }

        // Block reserved domains
        if (domain === "anon.li") {
            throw new ValidationError("This domain is reserved and cannot be added")
        }

        // Check plan limits
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { domains: true }
        })

        if (!user) {
            throw new NotFoundError("User not found")
        }

        const { domains: domainsLimit } = getPlanLimits(user)

        // Early-exit optimization (authoritative check is inside the transaction)
        if (user.domains.length >= domainsLimit) {
            const message = domainsLimit === 0
                ? "Custom domains are available on Plus and Pro plans."
                : `Domain limit reached (${domainsLimit}). Upgrade to increase.`
            throw new ForbiddenError(message)
        }

        // Generate DKIM keys outside the transaction (async I/O)
        const dkimKeys = await generateDkimKeys()
        const verificationToken = crypto.randomBytes(24).toString('hex')

        // Serializable transaction: re-check count and create atomically
        const newDomain = await prisma.$transaction(async (tx) => {
            const currentCount = await tx.domain.count({ where: { userId } })
            if (currentCount >= domainsLimit) {
                const message = domainsLimit === 0
                    ? "Custom domains are available on Plus and Pro plans."
                    : `Domain limit reached (${domainsLimit}). Upgrade to increase.`
                throw new ForbiddenError(message)
            }
            const encryptedPrivateKey = process.env.DKIM_ENCRYPTION_KEY
                ? encryptField(dkimKeys.privateKey, "DKIM_ENCRYPTION_KEY")
                : dkimKeys.privateKey

            return tx.domain.create({
                data: {
                    domain,
                    userId,
                    verificationToken,
                    dkimPrivateKey: encryptedPrivateKey,
                    dkimPublicKey: dkimKeys.publicKey,
                    dkimSelector: 'default',
                    dkimVerified: false
                }
            })
        }, { isolationLevel: "Serializable" })

        logger.info("Domain created", { userId, domain })
        return newDomain
    }

    static async verifyDomain(userId: string, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        if (domain.userId !== userId) {
            throw new ForbiddenError("You don't have permission to verify this domain")
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

            // Transaction: Claim ownership & Revoke others
            await prisma.$transaction([
                // 1. Verify this domain
                prisma.domain.update({
                    where: { id: domainId },
                    data: {
                        ownershipVerified: hasOwnership,
                        mxVerified: hasMx,
                        spfVerified: hasSpf,
                        dkimVerified: hasDkim,
                        dnsVerified,
                        verified
                    }
                }),
                // 2. If fully verified, revoke others with same domain name
                ...(verified ? [
                    prisma.domain.updateMany({
                        where: {
                            domain: domain.domain,
                            id: { not: domainId },
                            verified: true
                        },
                        data: {
                            verified: false,
                            ownershipVerified: false,
                        }
                    })
                ] : [])
            ])

            logger.info("Domain verification completed", { userId, domainId, verified })

            return {
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
    }

    static async regenerateDkim(userId: string, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        if (domain.userId !== userId) {
            throw new ForbiddenError("You don't have permission to modify this domain")
        }

        const keys = await generateDkimKeys()
        const encryptedPrivateKey = process.env.DKIM_ENCRYPTION_KEY
            ? encryptField(keys.privateKey, "DKIM_ENCRYPTION_KEY")
            : keys.privateKey

        const updatedDomain = await prisma.domain.update({
            where: { id: domainId },
            data: {
                dkimPrivateKey: encryptedPrivateKey,
                dkimPublicKey: keys.publicKey,
                dkimSelector: "default",
                dkimVerified: false,
            }
        })

        logger.info("DKIM keys regenerated", { userId, domainId })

        return {
            id: updatedDomain.id,
            domain: updatedDomain.domain,
            dkimPublicKey: updatedDomain.dkimPublicKey,
            dkimSelector: updatedDomain.dkimSelector,
            dkimVerified: updatedDomain.dkimVerified
        }
    }

    static async deleteDomain(userId: string, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        if (domain.userId !== userId) {
            throw new ForbiddenError("You don't have permission to delete this domain")
        }

        // Delete domain and associated aliases atomically
        await prisma.$transaction([
            prisma.alias.deleteMany({
                where: {
                    domain: domain.domain,
                    userId
                }
            }),
            prisma.domain.delete({
                where: { id: domainId }
            })
        ])

        logger.info("Domain deleted", { userId, domainId, domain: domain.domain })
    }
}
