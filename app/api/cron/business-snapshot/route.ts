import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";
import { handleBusinessSnapshotCron } from "@/lib/services/cron-business-snapshot";

const logger = createLogger("CronBusinessSnapshot");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "business-snapshot")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await withCronLock("business-snapshot", 5 * 60, () => handleBusinessSnapshotCron());
        if (result === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" });
        }
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Business snapshot cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
