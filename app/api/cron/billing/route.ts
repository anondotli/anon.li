import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { handleBillingCron } from "@/lib/services/cron-billing";

const logger = createLogger("CronBilling");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "billing")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await handleBillingCron();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Billing cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
