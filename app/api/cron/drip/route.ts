import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";
import { handleDripCron } from "@/lib/services/cron-drip";

const logger = createLogger("CronDrip");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "drip")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        // Share the "daily" lock so a manual trigger can't race the scheduled
        // daily run, which executes this same handler under that lock.
        const results = await withCronLock("daily", 15 * 60, () => handleDripCron());
        if (results === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" });
        }
        return NextResponse.json({ success: true, results });
    } catch (error) {
        logger.error("Drip cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
