import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { handleHeavyUserUpsellCron } from "@/lib/services/cron-heavy-user-upsell";

const logger = createLogger("CronHeavyUserUpsell");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "heavy-user-upsell")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await handleHeavyUserUpsellCron();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Heavy-user upsell cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
