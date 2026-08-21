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

    it("drops every event from public and embedded Form pages", () => {
        for (const path of [
            "/f",
            "/f/abcdefghijkl",
            "/embed/f",
            "/embed/f/abcdefghijkl",
        ]) {
            expect(
                scrubPostHogEvent({
                    event: "$autocapture",
                    properties: { $pathname: path },
                }),
            ).toBeNull()
        }
    })

    it("drops Form events when only the current URL identifies the page", () => {
        for (const url of [
            "https://anon.li/f/abcdefghijkl?source=customer",
            "https://anon.li/embed/f/abcdefghijkl?source=customer",
        ]) {
            expect(
                scrubPostHogEvent({
                    event: "$pageview",
                    properties: { $current_url: url },
                }),
            ).toBeNull()
        }
    })

    it("does not treat the Form marketing page as a private Form route", () => {
        expect(
            scrubPostHogEvent({ event: "$pageview", properties: { $pathname: "/form" } }),
        ).not.toBeNull()
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

    // Ids are 8 chars and fall well under looksLikeId's >=12 floor, so they are
    // masked by the positional rule instead. /dashboard/* is not a private
    // prefix, so without that rule these ids would reach PostHog in the clear.
    it.each([
        ["an 8-char id (current format)", "a1b2c3d4"],
        ["a 12-char legacy id", "abc123def456"],
        ["an all-letters id the digit+letter heuristic would miss", "abcdefgh"],
    ])("masks %s in /dashboard/form", (_label, id) => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: {
                $current_url: `https://anon.li/dashboard/form/${id}`,
                $pathname: `/dashboard/form/${id}`,
            },
        })
        expect(out!.properties!.$pathname).toBe("/dashboard/form/[id]")
        expect(out!.properties!.$current_url).toContain("/dashboard/form/[id]")
        expect(out!.properties!.$current_url).not.toContain(id)
    })

    it("masks the id in the /dashboard/form/[id]/edit sub-route", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: { $pathname: "/dashboard/form/a1b2c3d4/edit" },
        })
        expect(out!.properties!.$pathname).toBe("/dashboard/form/[id]/edit")
    })

    it("preserves human-readable slugs (blog/docs)", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: { $pathname: "/blog/introducing-anon-li" },
        })
        expect(out!.properties!.$pathname).toBe("/blog/introducing-anon-li")
    })

    // Guards against "just lower the floor to 10" — this slug is 11 chars and
    // contains both a digit and a letter, so a lowered threshold would mask it.
    it("preserves a short slug containing digits", () => {
        const out = scrubPostHogEvent({
            event: "$pageview",
            properties: { $pathname: "/blog/top-10-tips" },
        })
        expect(out!.properties!.$pathname).toBe("/blog/top-10-tips")
    })

    // The positional rule keys off the parent segment, so a docs page whose last
    // segment is literally "drop"/"form" must not be mistaken for an id.
    it.each(["/docs/api/drop", "/docs/cli/drop", "/docs/api/form"])(
        "preserves the docs path %s",
        (pathname) => {
            const out = scrubPostHogEvent({ event: "$pageview", properties: { $pathname: pathname } })
            expect(out!.properties!.$pathname).toBe(pathname)
        },
    )

    it("drops known third-party noise rejections (Outlook SafeLink / antivirus)", () => {
        const event: PostHogEventLike = {
            event: "$exception",
            properties: {
                $current_url: "https://anon.li/docs/legal/aup",
                $exception_list: [
                    {
                        type: "UnhandledRejection",
                        value: "Non-Error promise rejection captured with value: Object Not Found Matching Id:4, MethodName:update, ParamCount:4",
                        mechanism: { handled: false, synthetic: true, type: "generic" },
                    },
                ],
                $exception_values: [
                    "Non-Error promise rejection captured with value: Object Not Found Matching Id:4, MethodName:update, ParamCount:4",
                ],
            },
        }
        expect(scrubPostHogEvent(event)).toBeNull()
    })

    it("keeps genuine $exception events", () => {
        const event: PostHogEventLike = {
            event: "$exception",
            properties: {
                $current_url: "https://anon.li/login",
                $exception_list: [{ type: "TypeError", value: "Failed to fetch" }],
                $exception_values: ["Failed to fetch"],
            },
        }
        expect(scrubPostHogEvent(event)).not.toBeNull()
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

    it("redacts private Form links in referrers and element hrefs even for all-letter IDs", () => {
        const out = scrubPostHogEvent({
            event: "$autocapture",
            properties: {
                $pathname: "/pricing",
                $referrer: "https://anon.li/f/abcdefghijkl",
                $initial_referrer: "/embed/f/abcdefghijkl?source=customer",
                $elements: [{ href: "https://anon.li/f/abcdefghijkl", tag_name: "a" }],
                $elements_chain: "a[href='https://anon.li/f/abcdefghijkl']",
            },
        })

        expect(out!.properties!.$referrer).toBe("https://anon.li/[private]")
        expect(out!.properties!.$initial_referrer).toBe("/[private]")
        const elements = out!.properties!.$elements as Array<{ href: string }>
        expect(elements[0]!.href).toBe("https://anon.li/[private]")
        expect(out!.properties!.$elements_chain).not.toContain("abcdefghijkl")
    })
})
