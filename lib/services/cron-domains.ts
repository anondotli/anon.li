import dns from "dns";
import util from "util";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { sendDomainDeletedEmail, sendDomainUnverifiedEmail } from "@/lib/resend";
import { getOrgAdminEmails } from "@/lib/data/organization";
import { REVOKED_DOMAIN_GRACE_DAYS } from "@/lib/constants";

const logger = createLogger("CronDomains");
const resolveTxt = util.promisify(dns.resolveTxt);
const DNS_TIMEOUT_MS = 10_000;
const STALE_CLEANUP_BATCH_SIZE = 100;
const REVERIFICATION_BATCH_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Never-verified claims are abandoned after this long. */
const NEVER_VERIFIED_TTL_MS = DAY_MS;
// Days a revoked (previously verified) domain survives before cleanup. Lives in
// lib/constants so the "verification lost" email can state it.
export { REVOKED_DOMAIN_GRACE_DAYS };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("DNS lookup timed out")), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/**
 * Resolve who to notify about a domain event and send to each.
 * Org domains → the org's owners/admins (the creator may have left, and
 * `Domain.userId` is SET NULL on user deletion, so org notices must come from
 * membership — not the row's `user`). Personal domains → the owning user.
 * Returns the number of sends that failed (for the cron's error tally).
 */
async function notifyDomainOwners(
    domain: { domain: string; organizationId: string | null; user?: { email: string | null } | null },
    send: (email: string, domainName: string) => Promise<unknown>,
): Promise<number> {
    const recipients = domain.organizationId
        ? await getOrgAdminEmails(domain.organizationId)
        : domain.user?.email
            ? [domain.user.email]
            : [];

    let failures = 0;
    await Promise.allSettled(
        recipients.map(async (email) => {
            try {
                const result = await send(email, domain.domain);
                // The lib/resend senders swallow errors and report them as
                // `{ success: false }` rather than throwing — count those too.
                if (isFailedSend(result)) {
                    failures++;
                    logger.warn("Domain notification send failed", { domain: domain.domain });
                }
            } catch (error) {
                failures++;
                logger.error("Error sending domain notification", error, { domain: domain.domain });
            }
        }),
    );
    return failures;
}

function isFailedSend(result: unknown): boolean {
    return typeof result === "object"
        && result !== null
        && "success" in result
        && (result as { success: unknown }).success === false;
}

export async function handleDomainsCron() {
    const cleanupResults = await cleanupStaleDomains();
    const reverifyResults = await reverifyActiveDomains();
    return { cleanup: cleanupResults, reverify: reverifyResults };
}

/**
 * Delete abandoned domain claims and domains whose verification was revoked and
 * never restored. Two distinct populations:
 * - never verified (`unverifiedAt` null): removed 24h after creation;
 * - previously verified, then revoked (`unverifiedAt` set): removed only after
 *   REVOKED_DOMAIN_GRACE_DAYS, giving the owner time to act on the
 *   "verification lost" email before the domain and its aliases disappear.
 * Each domain's aliases (Alias.domain is a plain string, not an FK) are deleted
 * in the same transaction, scoped to the domain's owner — matching
 * DomainService.deleteDomain.
 */
export async function cleanupStaleDomains() {
    const results = { deleted: 0, errors: 0 };
    const now = Date.now();
    const neverVerifiedThreshold = new Date(now - NEVER_VERIFIED_TTL_MS);
    const revokedThreshold = new Date(now - REVOKED_DOMAIN_GRACE_DAYS * DAY_MS);

    const staleDomains = await prisma.domain.findMany({
        where: {
            verified: false,
            OR: [
                { unverifiedAt: null, createdAt: { lt: neverVerifiedThreshold } },
                { unverifiedAt: { lt: revokedThreshold } },
            ],
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
        take: STALE_CLEANUP_BATCH_SIZE,
    });

    if (staleDomains.length === 0) return results;

    const deletedDomains: typeof staleDomains = [];
    for (const domain of staleDomains) {
        try {
            const removed = await prisma.$transaction(async (tx) => {
                // Guard on `verified: false` so a domain re-verified since the
                // select above is neither deleted nor stripped of its aliases.
                const { count } = await tx.domain.deleteMany({
                    where: { id: domain.id, verified: false },
                });
                if (count === 0) return false;

                await tx.alias.deleteMany({
                    where: domain.organizationId
                        ? { domain: domain.domain, organizationId: domain.organizationId }
                        : { domain: domain.domain, userId: domain.userId, organizationId: null },
                });
                return true;
            });
            if (removed) {
                results.deleted++;
                deletedDomains.push(domain);
            }
        } catch (error) {
            logger.error("Error deleting stale domain", error, { domainId: domain.id });
            results.errors++;
        }
    }

    // Keep outbound email concurrency bounded. Bursting a large stale-domain
    // batch at Resend can trip provider rate limits and turn a successful DB
    // cleanup into a wall of failed notifications.
    for (const domain of deletedDomains) {
        results.errors += await notifyDomainOwners(domain, sendDomainDeletedEmail);
    }

    return results;
}

export async function reverifyActiveDomains() {
    const results = { checked: 0, revoked: 0, errors: 0 };

    const activeDomainCount = await prisma.domain.count({ where: { verified: true } });
    if (activeDomainCount === 0) return results;

    // Rotate through deterministic pages so `take: 50` does not re-check the
    // same first 50 rows forever once the project grows beyond one batch.
    const pageCount = Math.ceil(activeDomainCount / REVERIFICATION_BATCH_SIZE);
    const epochDay = Math.floor(Date.now() / DAY_MS);
    const page = epochDay % pageCount;

    const activeDomains = await prisma.domain.findMany({
        where: { verified: true },
        include: { user: true },
        orderBy: { id: "asc" },
        skip: page * REVERIFICATION_BATCH_SIZE,
        take: REVERIFICATION_BATCH_SIZE,
    });

    for (const domain of activeDomains) {
        results.checked++;
        try {
            const isVerified = await verifyDomainOwnership(domain.domain, domain.verificationToken);

            if (!isVerified) {
                await prisma.domain.update({
                    where: { id: domain.id },
                    data: {
                        verified: false,
                        ownershipVerified: false,
                        // Starts the cleanup grace period (see cleanupStaleDomains).
                        unverifiedAt: new Date(),
                    },
                });
                results.revoked++;

                results.errors += await notifyDomainOwners(domain, sendDomainUnverifiedEmail);
            }
        } catch (error) {
            logger.error("Error re-verifying domain", error, { domain: domain.domain });
            results.errors++;
        }
    }

    return results;
}

async function verifyDomainOwnership(domain: string, token: string): Promise<boolean> {
    let txtRecords: string[][];
    try {
        txtRecords = await withTimeout(resolveTxt(domain), DNS_TIMEOUT_MS);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENODATA" || code === "ENOTFOUND" || code === "ENODOMAIN") {
            return false;
        }
        // Timeouts and resolver/server failures are inconclusive. Surface them
        // to the per-domain error tally instead of revoking a valid domain.
        throw error;
    }
    const expectedOwnershipTxt = `anon.li=${token}`;

    return txtRecords.some((record) => {
        const txt = Array.isArray(record) ? record.join("") : record;
        return txt === expectedOwnershipTxt;
    });
}
