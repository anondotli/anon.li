import { z } from "zod"
import { parseHttpsOrLoopbackHttpUrl, parseHttpsUrl } from "@/lib/url-safety"

const httpsUrl = z.string().max(2_048).refine(
    (value) => parseHttpsUrl(value) !== null,
    "Metadata URLs must use HTTPS",
)
const redirectUrl = z.string().max(2_048).refine((value) => {
    return isSafeMcpRedirectUri(value)
}, "Redirect URIs must use HTTPS (except localhost) and cannot contain fragments")

const FORBIDDEN_REGISTRATION_FIELDS = [
    "backchannel_logout_uri",
    "backchannel_logout_session_required",
    "post_logout_redirect_uris",
] as const

const SUPPORTED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"])

const ClientRegistrationSchema = z.object({
    redirect_uris: z.array(redirectUrl).min(1).max(10),
    application_type: z.enum(["web", "native"]).optional(),
    token_endpoint_auth_method: z.enum(["none", "client_secret_basic", "client_secret_post"]).optional(),
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
    // MCP clients have no use for RP-initiated or back-channel logout, and an
    // anonymous registration must not be able to make the server call out.
    for (const field of FORBIDDEN_REGISTRATION_FIELDS) {
        if (field in value) {
            ctx.addIssue({ code: "custom", message: `${field} is not supported` })
        }
    }
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

function isLoopbackHostname(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

/**
 * Infer the RFC 7591 / OIDC `application_type` for a registration that omits
 * it. better-auth 1.7 defaults to `web`, which only accepts HTTPS redirects on
 * non-loopback hosts — that would reject every desktop/CLI MCP client (Claude
 * Code, MCP Inspector, …) that registers `http://localhost:<port>/callback`.
 */
function inferApplicationType(redirectUris: unknown): "web" | "native" {
    if (!Array.isArray(redirectUris)) return "web"
    for (const value of redirectUris) {
        if (typeof value !== "string") continue
        try {
            const url = new URL(value)
            if (url.protocol !== "https:" || isLoopbackHostname(url.hostname)) return "native"
        } catch {
            // Invalid URIs are rejected by validation; they do not change the type.
        }
    }
    return "web"
}

/**
 * Rewrite a dynamic client registration body into something better-auth 1.7
 * accepts without loosening any of our own checks (applied afterwards by
 * `validateMcpClientRegistration` in the auth before-hook):
 *
 * - `scope` is dropped: the provider persists every anon.li scope for a DCR
 *   client anyway, and an `openid profile email` request would be rejected.
 * - `resources` is dropped: `mcp()` links its own resource by default; a stale
 *   value (e.g. the bare origin 1.6 advertised) would fail with invalid_target.
 * - `grant_types` is narrowed to the grants this server offers and
 *   `response_types` made reciprocal, as 1.7 requires.
 * - `application_type` is inferred when absent (see inferApplicationType).
 */
export function normalizeMcpClientRegistration(body: unknown): unknown {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body
    const { scope: _scope, resources: _resources, ...rest } = body as Record<string, unknown>
    const normalized: Record<string, unknown> = { ...rest }

    const grantTypes = Array.isArray(rest.grant_types)
        ? rest.grant_types.filter((grant): grant is string => typeof grant === "string" && SUPPORTED_GRANT_TYPES.has(grant))
        : []
    normalized.grant_types = grantTypes.includes("authorization_code")
        ? Array.from(new Set(grantTypes))
        : ["authorization_code", "refresh_token"]
    normalized.response_types = ["code"]

    if (rest.application_type === undefined) {
        normalized.application_type = inferApplicationType(rest.redirect_uris)
    }

    return normalized
}

/**
 * Distinct, display-safe origins for a client's registered redirect URIs.
 *
 * The authorization endpoint only delivers the code to a redirect_uri the client
 * registered, so surfacing these on the consent screen shows the user every host
 * their authorization can be sent to — the disclosure that defeats a
 * "register a client pointing at an attacker domain" consent-phishing flow.
 * Each entry is re-validated here so a malformed or unsafe value is never rendered.
 */
export function registeredRedirectOrigins(redirectUris: readonly string[] | null | undefined): string[] {
    const origins = new Set<string>()
    for (const value of redirectUris ?? []) {
        const url = parseHttpsOrLoopbackHttpUrl(value.trim())
        if (url) origins.add(url.origin)
    }
    return Array.from(origins)
}
