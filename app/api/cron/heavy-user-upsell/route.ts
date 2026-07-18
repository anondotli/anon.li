import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { withCronLock } from "@/lib/cron-lock";
import { createLogger } from "@/lib/logger";
import { handleHeavyUserUpsellCron } from "@/lib/services/cron-heavy-user-upsell";

const logger = createLogger("CronHeavyUserUpsell");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "heavy-user-upsell")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await withCronLock("heavy-user-upsell", 15 * 60, () => handleHeavyUserUpsellCron());
        if (result === null) {
            return NextResponse.json({ success: true, skipped: "lock-held" });
        }
        return NextResponse.json(
            { success: result.errors === 0, ...result },
            { status: result.errors === 0 ? 200 : 500 },
        );
    } catch (error) {
        logger.error("Heavy-user upsell cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
