import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { buildOrgDataExport } from "@/lib/data/org-export"
import { audit } from "@/lib/services/audit"
import { meetsMinRole } from "@/lib/ownership"
import { rateLimit } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"

const logger = createLogger("OrgExportAPI")

/**
 * GET /api/org/export
 * Portable JSON export of the active organization's data. Owner/admin only.
 */
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const organizationId = session.activeOrganizationId
        if (!organizationId || !meetsMinRole(session.activeOrgRole, "admin")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        // Heavy multi-table read — rate limit per user.
        const rateLimited = await rateLimit("userExport", session.user.id)
        if (rateLimited) return rateLimited

        const data = await buildOrgDataExport(organizationId)

        void audit({ action: "org.data.export", actorId: session.user.id, organizationId })

        return new NextResponse(JSON.stringify(data, null, 2), {
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="anon-li-org-export-${new Date().toISOString().split("T")[0]}.json"`,
            },
        })
    } catch (error) {
        logger.error("Error exporting organization data", error)
        return NextResponse.json({ error: "Failed to export data" }, { status: 500 })
    }
}
