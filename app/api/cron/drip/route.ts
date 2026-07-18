import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";
import { handleDripCron } from "@/lib/services/cron-drip";

const logger = createLogger("CronDrip");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "drip")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const results = await withCronLock("drip", 15 * 60, () => handleDripCron());
        if (results === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" });
        }
        const errorCount = Object.values(results).reduce((sum, stage) => sum + stage.errors, 0);
        return NextResponse.json(
            { success: errorCount === 0, results },
            { status: errorCount === 0 ? 200 : 500 },
        );
    } catch (error) {
        logger.error("Drip cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
