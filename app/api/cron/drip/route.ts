import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { handleDripCron } from "@/lib/services/cron-drip";

const logger = createLogger("CronDrip");

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "drip")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const results = await handleDripCron();
        return NextResponse.json({ success: true, results });
    } catch (error) {
        logger.error("Drip cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
