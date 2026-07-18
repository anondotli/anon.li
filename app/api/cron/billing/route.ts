import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withCronLock } from "@/lib/cron-lock";
import { handleBillingCron } from "@/lib/services/cron-billing";

const logger = createLogger("CronBilling");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "billing")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await withCronLock("billing", 15 * 60, () => handleBillingCron());
        if (result === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" });
        }

        const reconciliationErrors = "error" in result.reconciliation
            ? 1
            : result.reconciliation.errors;
        const errorCount = result.scheduling.errors
            + result.deletion.errors
            + result.cryptoReminders.errors
            + reconciliationErrors;

        if (errorCount > 0) {
            logger.error("Billing cron completed with partial failures", undefined, { errorCount });
        }

        return NextResponse.json(
            { success: errorCount === 0, ...result },
            { status: errorCount === 0 ? 200 : 500 },
        );
    } catch (error) {
        logger.error("Billing cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
