import { NextResponse } from "next/server"
import { buildOrgDataExport } from "@/lib/data/org-export"
import { audit } from "@/lib/services/audit"
import { createLogger } from "@/lib/logger"
import { withPolicy } from "@/lib/route-policy"

const logger = createLogger("OrgExportAPI")

/**
 * GET /api/org/export
 * Portable JSON export of the active organization's data. Owner/admin only.
 */
export const GET = withPolicy(
    {
        auth: "session",
        organization: "required",
        minOrgRole: "admin",
        rateLimit: "userExport",
    },
    async (ctx) => {
        try {
            if (!ctx.userId || !ctx.organizationId) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 })
            }
            const organizationId = ctx.organizationId

            const data = await buildOrgDataExport(organizationId)

            void audit({ action: "org.data.export", actorId: ctx.userId, organizationId })

            return new NextResponse(JSON.stringify(data, null, 2), {
                headers: {
                    "Cache-Control": "private, no-store",
                    "Content-Type": "application/json",
                    "Content-Disposition": `attachment; filename="anon-li-org-export-${new Date().toISOString().split("T")[0]}.json"`,
                },
            })
        } catch (error) {
            logger.error("Error exporting organization data", error)
            return NextResponse.json({ error: "Failed to export data" }, { status: 500 })
        }
    },
)
