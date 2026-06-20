import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";
import { handleCryptoRecoveryCron } from "@/lib/services/cron-crypto-recovery";

const logger = createLogger("CronCryptoRecovery");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "crypto-recovery")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        // Share the "daily" lock so a manual trigger can't race the scheduled
        // daily run, which executes this same handler under that lock.
        const result = await withCronLock("daily", 15 * 60, () => handleCryptoRecoveryCron());
        if (result === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" });
        }
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Crypto recovery cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
