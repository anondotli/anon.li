import { NextResponse } from "next/server"
import { validateCronAuth } from "@/lib/cron-auth"
import { createLogger } from "@/lib/logger"
import { handleDomainsCron } from "@/lib/services/cron-domains"

const logger = createLogger("CronDomains")

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
