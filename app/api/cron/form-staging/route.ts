import { NextRequest, NextResponse } from "next/server"

import { validateCronAuth } from "@/lib/cron-auth"
import { withCronLock } from "@/lib/cron-lock"
import { createLogger } from "@/lib/logger"

const logger = createLogger("CronFormStaging")

async function handleCron(req: NextRequest): Promise<NextResponse> {
    if (!validateCronAuth(req, "form-staging")) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const result = await withCronLock("form-staging-cleanup", 15 * 60, async () => {
        try {
            const { DropCleanupService } = await import("@/lib/services/drop-cleanup")
            const cleanup = await DropCleanupService.cleanupIncompleteUploads()
            return NextResponse.json(
                { success: cleanup.errors.length === 0, ...cleanup },
                { status: cleanup.errors.length === 0 ? 200 : 500 },
            )
        } catch (error) {
            logger.error("Form staging cleanup failed", error)
            return NextResponse.json({ success: false }, { status: 500 })
        }
    })

    return result ?? NextResponse.json({ success: true, skipped: "lock-held" })
}

export { handleCron as GET, handleCron as POST }
