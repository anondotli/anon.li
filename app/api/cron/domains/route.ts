import { NextResponse } from "next/server"
import { validateCronAuth } from "@/lib/cron-auth"
import { createLogger } from "@/lib/logger"
import { withCronLock } from "@/lib/cron-lock"
import { handleDomainsCron } from "@/lib/services/cron-domains"

const logger = createLogger("CronDomains")

async function handleCron(req: Request) {
    if (!validateCronAuth(req, "domains")) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Share the "daily" lock so a manual trigger can't race the scheduled
        // daily run, which executes this same handler under that lock.
        const results = await withCronLock("daily", 15 * 60, () => handleDomainsCron());
        if (results === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" })
        }
        return NextResponse.json({ success: true, results })
    } catch (error) {
        logger.error("Cron domain job error", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

export { handleCron as GET, handleCron as POST };
