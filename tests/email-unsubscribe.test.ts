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

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
    it("roundtrips a valid user id", async () => {
        const { signUnsubscribeToken, verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = signUnsubscribeToken("user_abc");
        expect(verifyUnsubscribeToken(token)).toBe("user_abc");
    });

    it("rejects a tampered hmac", async () => {
        const { signUnsubscribeToken, verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = signUnsubscribeToken("user_abc");
        const tampered = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
        expect(verifyUnsubscribeToken(tampered)).toBeNull();
    });

    it("rejects a token with a swapped user id", async () => {
        const { signUnsubscribeToken, verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = signUnsubscribeToken("user_abc");
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
        const { signUnsubscribeToken, verifyUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = signUnsubscribeToken("user_abc");
        process.env.AUTH_SECRET = "rotated-secret";
        vi.resetModules();
        const rotated = await import("@/lib/email-unsubscribe");
        expect(rotated.verifyUnsubscribeToken(token)).toBeNull();
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

    it("GET with a valid token flips the flag and returns 200 HTML", async () => {
        const { signUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = signUnsubscribeToken("user_abc");

        const { GET } = await import("@/app/api/email/unsubscribe/route");
        const req = new Request(`https://anon.li/api/email/unsubscribe?token=${encodeURIComponent(token)}`) as unknown as import("next/server").NextRequest;
        // Manually attach nextUrl for NextRequest shape
        (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);

        const res = await GET(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("text/html");
        expect(userUpdate).toHaveBeenCalledWith({
            where: { id: "user_abc" },
            data: { dripUnsubscribed: true },
        });
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
        const { signUnsubscribeToken } = await import("@/lib/email-unsubscribe");
        const token = signUnsubscribeToken("user_abc");

        const { POST } = await import("@/app/api/email/unsubscribe/route");
        const req = new Request(`https://anon.li/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
            method: "POST",
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
