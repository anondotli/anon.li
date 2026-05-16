import dns from "dns";
import util from "util";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { sendDomainDeletedEmail, sendDomainUnverifiedEmail } from "@/lib/resend";

const logger = createLogger("CronDomains");
const resolveTxt = util.promisify(dns.resolveTxt);

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
    }) as unknown as Array<{ id: string; domain: string; user: { id: string; email: string | null } }>;

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

    const emailPromises = staleDomains
        .filter((domain) => domain.user?.email)
        .map(async (domain) => {
            try {
                if (domain.user?.email) {
                    await sendDomainDeletedEmail(domain.user.email, domain.domain);
                }
            } catch (error) {
                logger.error("Error sending deletion email", error, { domain: domain.domain });
                results.errors++;
            }
        });

    await Promise.allSettled(emailPromises);

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

                if (domain.user?.email) {
                    await sendDomainUnverifiedEmail(domain.user.email, domain.domain);
                }
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
