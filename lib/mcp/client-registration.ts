import { z } from "zod"
import { parseHttpsOrLoopbackHttpUrl, parseHttpsUrl } from "@/lib/url-safety"

const httpsUrl = z.string().max(2_048).refine(
    (value) => parseHttpsUrl(value) !== null,
    "Metadata URLs must use HTTPS",
)
const redirectUrl = z.string().max(2_048).refine((value) => {
    return isSafeMcpRedirectUri(value)
}, "Redirect URIs must use HTTPS (except localhost) and cannot contain fragments")

const ClientRegistrationSchema = z.object({
    redirect_uris: z.array(redirectUrl).min(1).max(10),
    client_name: z.string().trim().min(1).max(120).refine(
        (value) => !/[\u0000-\u001F\u007F]/u.test(value),
        "Client names cannot contain control characters",
    ),
    logo_uri: httpsUrl.optional(),
    client_uri: httpsUrl.optional(),
    tos_uri: httpsUrl.optional(),
    policy_uri: httpsUrl.optional(),
    jwks_uri: httpsUrl.optional(),
    scope: z.string().max(1_000).optional(),
    contacts: z.array(z.string().max(254)).max(10).optional(),
    software_id: z.string().max(200).optional(),
    software_version: z.string().max(200).optional(),
    software_statement: z.string().max(16_384).optional(),
}).passthrough().superRefine((value, ctx) => {
    try {
        if (JSON.stringify(value).length > 32_768) {
            ctx.addIssue({ code: "custom", message: "Client registration metadata is too large" })
        }
    } catch {
        ctx.addIssue({ code: "custom", message: "Client registration metadata is invalid" })
    }
})

export function validateMcpClientRegistration(value: unknown): string | null {
    const parsed = ClientRegistrationSchema.safeParse(value)
    return parsed.success ? null : parsed.error.issues[0]?.message ?? "Invalid client registration"
}

export function isSafeMcpRedirectUri(value: unknown): value is string {
    const url = parseHttpsOrLoopbackHttpUrl(value)
    return url !== null && url.hash === ""
}
