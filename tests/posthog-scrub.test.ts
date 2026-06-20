import { describe, it, expect } from "vitest"
import { scrubPostHogEvent, type PostHogEventLike } from "@/lib/posthog-scrub"

describe("scrubPostHogEvent", () => {
    it("drops events from Drop download pages (key lives in the fragment)", () => {
        const event: PostHogEventLike = {
            event: "$pageview",
            properties: { $current_url: "https://anon.li/d/abc123#SECRETKEYMATERIAL", $pathname: "/d/abc123" },
        }
        expect(scrubPostHogEvent(event)).toBeNull()
    })

    it("drops events from token-bearing / internal routes", () => {
        for (const path of ["/reset", "/verify-recipient", "/2fa", "/admin/users"]) {
            const out = scrubPostHogEvent({ event: "$pageview", properties: { $pathname: path } })
            expect(out).toBeNull()
        }
    })

    it("strips the URL fragment from non-sensitive pages", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: { $current_url: "https://anon.li/pricing#section" },
        })
        expect(out).not.toBeNull()
        expect(out!.properties!.$current_url).toBe("https://anon.li/pricing")
    })

    it("keeps UTM params but strips other query params (e.g. tokens)", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: { $current_url: "https://anon.li/?utm_source=hn&token=secret123456" },
        })
        const url = out!.properties!.$current_url as string
        expect(url).toContain("utm_source=hn")
        expect(url).not.toContain("token")
        expect(url).not.toContain("secret123456")
    })

    it("masks resource IDs in the path", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: {
                $current_url: "https://anon.li/dashboard/form/clx9ab12cd34ef56",
                $pathname: "/dashboard/form/clx9ab12cd34ef56",
            },
        })
        expect(out!.properties!.$pathname).toBe("/dashboard/form/[id]")
        expect(out!.properties!.$current_url).toContain("/dashboard/form/[id]")
    })

    it("preserves human-readable slugs (blog/docs)", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: { $pathname: "/blog/introducing-anon-li" },
        })
        expect(out!.properties!.$pathname).toBe("/blog/introducing-anon-li")
    })

    it("strips fragments from autocaptured element hrefs", () => {
        const out = scrubPostHogEvent({
            event: "$autocapture",
            properties: {
                $current_url: "https://anon.li/drop",
                $elements: [{ href: "https://anon.li/d/abc#KEYMATERIAL", tag_name: "a" }],
            },
        })
        const els = out!.properties!.$elements as Array<{ href: string }>
        expect(els[0]!.href).not.toContain("KEYMATERIAL")
        expect(els[0]!.href).not.toContain("#")
    })
})
