/**
 * Tests for the one-click unsubscribe token and route.
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, AUTH_SECRET: "test-secret-for-unsubscribe" };
});

afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
});

async function buildUnsubscribeToken(userId: string) {
    const { unsubscribeUrl } = await import("@/lib/email-unsubscribe");
    const token = new URL(unsubscribeUrl(userId)).searchParams.get("token");
    if (!token) throw new Error("unsubscribe token was not generated");
    return token;
}

describe("unsubscribe token verification", () => {
    it("roundtrips a valid user id", async () => {
        const { verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = await buildUnsubscribeToken("user_abc");
        expect(verifyUnsubscribeToken(token)).toBe("user_abc");
    });

    it("rejects a tampered hmac", async () => {
        const { verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = await buildUnsubscribeToken("user_abc");
        const tampered = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
        expect(verifyUnsubscribeToken(tampered)).toBeNull();
    });

    it("rejects a token with a swapped user id", async () => {
        const { verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = await buildUnsubscribeToken("user_abc");
        const dot = token.lastIndexOf(".");
        const mac = token.slice(dot + 1);
        const swapped = `user_xyz.${mac}`;
        expect(verifyUnsubscribeToken(swapped)).toBeNull();
    });

    it("rejects malformed tokens", async () => {
        const { verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        expect(verifyUnsubscribeToken("")).toBeNull();
        expect(verifyUnsubscribeToken("no-dot")).toBeNull();
        expect(verifyUnsubscribeToken(".")).toBeNull();
        expect(verifyUnsubscribeToken("userid.")).toBeNull();
    });

    it("changes token when secret changes", async () => {
        const token = await buildUnsubscribeToken("user_abc");
        process.env.AUTH_SECRET = "rotated-secret";
        vi.resetModules();
        const rotated = await import("@/lib/email-unsubscribe");
        expect(rotated.verifyUnsubscribeToken(token)).toBeNull();
    });

    it("fails closed when AUTH_SECRET is missing", async () => {
        delete process.env.AUTH_SECRET;
        const { verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        expect(() => verifyUnsubscribeToken("user_abc.invalid")).toThrow(
            "AUTH_SECRET is required for unsubscribe tokens",
        );
    });
});

describe("/api/email/unsubscribe route", () => {
    const userUpdate = vi.fn();

    beforeEach(() => {
        userUpdate.mockReset();
        userUpdate.mockResolvedValue({ id: "user_abc", dripUnsubscribed: true });
        vi.doMock("@/lib/prisma", () => ({
            prisma: { user: { update: userUpdate } },
        }));
    });

    it("GET with a valid token renders a confirmation form without mutating", async () => {
        const token = await buildUnsubscribeToken("user_abc");

        const { GET } = await import("@/app/api/email/unsubscribe/route");
        const req = new Request(`https://anon.li/api/email/unsubscribe?token=${encodeURIComponent(token)}`) as unknown as import("next/server").NextRequest;
        // Manually attach nextUrl for NextRequest shape
        (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);

        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("text/html");
        expect(res.headers.get("Cache-Control")).toBe("private, no-store");
        const html = await res.text();
        // Link scanners prefetch GETs: the click alone must not unsubscribe.
        expect(userUpdate).not.toHaveBeenCalled();
        expect(html).toContain('<form method="post" action="/api/email/unsubscribe">');
        expect(html).toContain(`name="token" value="${token}"`);
        // Strict CSP on /api: the page must work without any script.
        expect(html).not.toContain("<script");
    });

    it("POST from the confirmation form flips the flag and returns an HTML page", async () => {
        const token = await buildUnsubscribeToken("user_abc");

        const { POST } = await import("@/app/api/email/unsubscribe/route");
        const body = new URLSearchParams({ token });
        const req = new Request("https://anon.li/api/email/unsubscribe", {
            method: "POST",
            headers: {
                Accept: "text/html,application/xhtml+xml",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        }) as unknown as import("next/server").NextRequest;
        (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("text/html");
        expect(await res.text()).toContain("Unsubscribed");
        expect(userUpdate).toHaveBeenCalledWith({
            where: { id: "user_abc" },
            data: { dripUnsubscribed: true },
        });
    });

    it("POST with a forged token is rejected", async () => {
        const { POST } = await import("@/app/api/email/unsubscribe/route");
        const req = new Request("https://anon.li/api/email/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: "user_abc.forged" }),
        }) as unknown as import("next/server").NextRequest;
        (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);

        const res = await POST(req);
        expect(res.status).toBe(400);
        expect(userUpdate).not.toHaveBeenCalled();
    });

    it("GET with an invalid token returns 400 and does not touch the DB", async () => {
        const { GET } = await import("@/app/api/email/unsubscribe/route");
        const req = new Request("https://anon.li/api/email/unsubscribe?token=garbage") as unknown as import("next/server").NextRequest;
        (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);

        const res = await GET(req);
        expect(res.status).toBe(400);
        expect(userUpdate).not.toHaveBeenCalled();
    });

    it("POST RFC 8058 one-click flips the flag", async () => {
        const token = await buildUnsubscribeToken("user_abc");

        const { POST } = await import("@/app/api/email/unsubscribe/route");
        const req = new Request(`https://anon.li/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
        }) as unknown as import("next/server").NextRequest;
        (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(userUpdate).toHaveBeenCalledWith({
            where: { id: "user_abc" },
            data: { dripUnsubscribed: true },
        });
    });
});
