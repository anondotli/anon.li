import dns from "dns";
import util from "util";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { sendDomainDeletedEmail, sendDomainUnverifiedEmail } from "@/lib/resend";
import { getOrgAdminEmails } from "@/lib/data/organization";

const logger = createLogger("CronDomains");
const resolveTxt = util.promisify(dns.resolveTxt);

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
                await send(email, domain.domain);
            } catch (error) {
                failures++;
                logger.error("Error sending domain notification", error, { domain: domain.domain });
            }
        }),
    );
    return failures;
}

export async function handleDomainsCron() {
    const cleanupResults = await cleanupStaleDomains();
    const reverifyResults = await reverifyActiveDomains();
    return { cleanup: cleanupResults, reverify: reverifyResults };
}

export async function cleanupStaleDomains() {
    const results = { deleted: 0, errors: 0 };
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleDomains = await prisma.domain.findMany({
        where: {
            verified: false,
            createdAt: { lt: threshold },
        },
        include: { user: true },
    }) as unknown as Array<{ id: string; domain: string; organizationId: string | null; user: { id: string; email: string | null } | null }>;

    if (staleDomains.length === 0) return results;

    const domainIds = staleDomains.map((domain) => domain.id);

    try {
        const deleteResult = await prisma.domain.deleteMany({
            where: { id: { in: domainIds } },
        });
        results.deleted = deleteResult.count;
    } catch (error) {
        logger.error("Error batch deleting stale domains", error);
        results.errors = staleDomains.length;
        return results;
    }

    const failureCounts = await Promise.all(
        staleDomains.map((domain) => notifyDomainOwners(domain, sendDomainDeletedEmail)),
    );
    results.errors += failureCounts.reduce((sum, count) => sum + count, 0);

    return results;
}

async function reverifyActiveDomains() {
    const results = { checked: 0, revoked: 0, errors: 0 };

    const activeDomains = await prisma.domain.findMany({
        where: { verified: true },
        include: { user: true },
        take: 50,
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
    const txtRecords = await resolveTxt(domain).catch(() => []);
    const expectedOwnershipTxt = `anon.li=${token}`;

    return txtRecords.some((record) => {
        const txt = Array.isArray(record) ? record.join("") : record;
        return txt === expectedOwnershipTxt;
    });
}
