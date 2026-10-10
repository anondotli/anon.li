/**
 * @vitest-environment node
 *
 * better-auth's MCP authorize endpoint only shows the consent screen when
 * `prompt` is exactly "consent"; otherwise a logged-in victim visiting an
 * attacker-crafted authorize URL (for a dynamically registered client with an
 * attacker redirect_uri) would hand the attacker an authorization code with no
 * user interaction. The route wrapper must force consent on every request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const handlers = vi.hoisted(() => ({
    GET: vi.fn(),
    POST: vi.fn(),
}))

vi.mock("better-auth/next-js", () => ({
    toNextJsHandler: vi.fn(() => handlers),
}))
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }))

import { GET } from "@/app/api/auth/[...all]/route"

async function delegatedAuthorizeUrl(query: string): Promise<URL> {
    const response = await GET(new Request(`https://anon.li/api/auth/mcp/authorize?${query}`))
    const body = await response.json() as { delegatedUrl: string }
    return new URL(body.delegatedUrl)
}

describe("/api/auth/mcp/authorize consent enforcement", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        handlers.GET.mockImplementation(async (request: Request) => Response.json({ delegatedUrl: request.url }))
    })

    it("forces prompt=consent when the client omits prompt", async () => {
        const url = await delegatedAuthorizeUrl(
            "client_id=attacker&response_type=code&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&scope=anon.li%3Aaliases",
        )
        expect(url.searchParams.get("prompt")).toBe("consent")
        // Other parameters are preserved untouched.
        expect(url.searchParams.get("redirect_uri")).toBe("https://evil.example/cb")
        expect(url.searchParams.get("client_id")).toBe("attacker")
    })

    it.each(["none", "login", "select_account", "login consent", ""])(
        "overrides a client-supplied prompt=%j",
        async (prompt) => {
            const url = await delegatedAuthorizeUrl(
                `client_id=attacker&response_type=code&prompt=${encodeURIComponent(prompt)}`,
            )
            expect(url.searchParams.getAll("prompt")).toEqual(["consent"])
        },
    )

    it("leaves non-authorize auth requests untouched", async () => {
        handlers.GET.mockImplementation(async (request: Request) => Response.json({ delegatedUrl: request.url }))
        const response = await GET(new Request("https://anon.li/api/auth/get-session?prompt=none"))
        const body = await response.json() as { delegatedUrl: string }
        expect(new URL(body.delegatedUrl).searchParams.get("prompt")).toBe("none")
    })
})
