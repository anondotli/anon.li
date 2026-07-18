import { NextResponse } from "next/server"
import { validateCronAuth } from "@/lib/cron-auth"
import { createLogger } from "@/lib/logger"
import { withCronLock } from "@/lib/cron-lock"
import { handleDomainsCron } from "@/lib/services/cron-domains"

const logger = createLogger("CronDomains")

export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handleCron(req: Request) {
    if (!validateCronAuth(req, "domains")) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const results = await withCronLock("domains", 15 * 60, () => handleDomainsCron());
        if (results === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" })
        }
        const errorCount = results.cleanup.errors + results.reverify.errors
        return NextResponse.json(
            { success: errorCount === 0, results },
            { status: errorCount === 0 ? 200 : 500 },
        )
    } catch (error) {
        logger.error("Cron domain job error", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export { handleCron as GET, handleCron as POST };
