/**
 * GET /api/v1/form/[id]/submission — list submissions (creator only).
 */

import { apiError, apiList, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { withPolicy } from "@/lib/route-policy"
import { FormService } from "@/lib/services/form"
import { listSubmissionsQuerySchema } from "@/lib/validations/form"

interface RouteParams {
    params: Promise<{ id: string }>
}

export const GET = withPolicy<RouteParams>(
    {
        auth: "api_key_or_session",
        apiQuota: "form",
        rateLimit: "formSubmissionRead",
    },
    async (ctx, routeContext) => {
        const { id } = await routeContext!.params
        const url = new URL(ctx.request.url)
        const parsed = listSubmissionsQuerySchema.safeParse({
            limit: url.searchParams.get("limit"),
            offset: url.searchParams.get("offset"),
            unreadOnly: url.searchParams.get("unreadOnly"),
        })
        if (!parsed.success) {
            return apiError("Invalid query", ErrorCodes.VALIDATION_ERROR, ctx.requestId, 400, zodErrorToDetails(parsed.error))
        }

        const result = await FormService.listSubmissions(id, ctx.userId!, parsed.data)
        const data = result.submissions.map((s) => ({
            id: s.id,
            created_at: s.createdAt.toISOString(),
            read_at: s.readAt?.toISOString() ?? null,
            has_attached_drop: s.hasAttachedDrop,
        }))

        return apiList(data, ctx.requestId, { total: result.total, limit: parsed.data.limit, offset: parsed.data.offset })
    },
)
