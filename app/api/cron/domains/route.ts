
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import dns from "dns"
import util from "util"
import { sendDomainDeletedEmail, sendDomainUnverifiedEmail } from "@/lib/resend"
import { validateCronAuth } from "@/lib/cron-auth"
import { createLogger } from "@/lib/logger"

const logger = createLogger("CronDomains")

const resolveTxt = util.promisify(dns.resolveTxt)

export async function handleDomainsCron() {
    const cleanupResults = await cleanupStaleDomains();
    const reverifyResults = await reverifyActiveDomains();
    return { cleanup: cleanupResults, reverify: reverifyResults };
}

async function handleCron(req: Request) {
    if (!validateCronAuth(req, "domains")) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const results = await handleDomainsCron();
        return NextResponse.json({ success: true, results })
    } catch (error) {
        logger.error("Cron domain job error", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export { handleCron as GET, handleCron as POST };

export async function cleanupStaleDomains() {
    const results = { deleted: 0, errors: 0 };
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago

    const staleDomains = await prisma.domain.findMany({
        where: {
            verified: false,
            createdAt: { lt: threshold }
        },
        include: { user: true }
    }) as unknown as Array<{ id: string; domain: string; user: { id: string; email: string | null } }>

    if (staleDomains.length === 0) return results;

    const domainIds = staleDomains.map(d => d.id)

    try {
        const deleteResult = await prisma.domain.deleteMany({
            where: { id: { in: domainIds } }
        })
        results.deleted = deleteResult.count
    } catch (error) {
        logger.error("Error batch deleting stale domains", error)
        results.errors = staleDomains.length
        return results
    }

    const emailPromises = staleDomains
        .filter(d => d.user?.email)
        .map(async (domain) => {
            try {
                if (domain.user?.email) {
                    await sendDomainDeletedEmail(domain.user.email, domain.domain)
                }
            } catch (error) {
                logger.error("Error sending deletion email", error, { domain: domain.domain })
                results.errors++
            }
        })

    await Promise.allSettled(emailPromises)

    return results;
}

async function reverifyActiveDomains() {
    const results = { checked: 0, revoked: 0, errors: 0 };

    const activeDomains = await prisma.domain.findMany({
        where: { verified: true },
        include: { user: true },
        take: 50
    })

    for (const domain of activeDomains) {
        results.checked++
        try {
            const isVerified = await verifyDomainOwnership(domain.domain, domain.verificationToken);

            if (!isVerified) {
                await prisma.domain.update({
                    where: { id: domain.id },
                    data: {
                        verified: false,
                        ownershipVerified: false
                    }
                })
                results.revoked++

                if (domain.user?.email) {
                    await sendDomainUnverifiedEmail(domain.user.email, domain.domain)
                }
            }
        } catch (error) {
            logger.error("Error re-verifying domain", error, { domain: domain.domain })
            results.errors++
        }
    }

    return results;
}

async function verifyDomainOwnership(domain: string, token: string): Promise<boolean> {
    const txtRecords = await resolveTxt(domain).catch(() => [])
    const expectedOwnershipTxt = `anon.li=${token}`

    return txtRecords.some(record => {
        const txt = Array.isArray(record) ? record.join('') : record
        return txt === expectedOwnershipTxt
    })
}
