import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { handleCryptoRecoveryCron } from "@/lib/services/cron-crypto-recovery";

const logger = createLogger("CronCryptoRecovery");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "crypto-recovery")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await handleCryptoRecoveryCron();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Crypto recovery cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
