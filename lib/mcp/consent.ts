import "server-only"

import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { auth } from "@/lib/auth"

type SearchParamsRecord = Record<string, string | string[] | undefined>

/**
 * Rebuild the provider-signed authorization query from Next's parsed
 * `searchParams`. Repeated keys (`ba_param`, multiple `resource`) must survive,
 * and order is irrelevant: the signature covers the canonically sorted query.
 */
export function buildOAuthQuery(searchParams: SearchParamsRecord): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
        if (Array.isArray(value)) {
            for (const item of value) params.append(key, item)
        } else if (typeof value === "string") {
            params.append(key, value)
        }
    }
    return params.toString()
}

export interface ConsentRequest {
    /** The signed query, posted back verbatim as `oauth_query`. */
    oauthQuery: string
    clientId: string
    scopes: string[]
    redirectUri: string | null
}

/**
 * Verify the query better-auth signed when it redirected to the consent (or
 * login) page. A valid signature proves the parameters came from our
 * authorize endpoint and have not expired (10 minutes); it does not check the
 * client or the session — the page does that.
 */
export async function parseConsentRequest(searchParams: SearchParamsRecord): Promise<ConsentRequest | null> {
    const oauthQuery = buildOAuthQuery(searchParams)
    const params = new URLSearchParams(oauthQuery)
    const clientId = params.get("client_id")
    if (!clientId || !params.get("sig")) return null

    const { secret } = await auth.$context
    if (!(await verifyOAuthQueryParams(oauthQuery, secret))) return null

    return {
        oauthQuery,
        clientId,
        scopes: (params.get("scope") ?? "").split(/\s+/).filter(Boolean),
        redirectUri: params.get("redirect_uri"),
    }
}
