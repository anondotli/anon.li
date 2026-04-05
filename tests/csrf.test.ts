import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateCsrf } from "@/lib/csrf";
import { ForbiddenError } from "@/lib/api-error-utils";

describe("validateCsrf", () => {
    const validUrl = "https://example.com";
    const validOrigin = "https://example.com";
    let originalAppUrl: string | undefined;

    beforeEach(() => {
        originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
        process.env.NEXT_PUBLIC_APP_URL = validUrl;
    });

    afterEach(() => {
        if (originalAppUrl === undefined) {
            delete process.env.NEXT_PUBLIC_APP_URL;
        } else {
            process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
        }
    });

    describe("Success cases", () => {
        it.each([
            ["valid Origin", { Origin: validOrigin }],
            ["valid Referer (missing Origin)", { Referer: validUrl + "/page" }],
        ])("should pass with %s", (_, headers) => {
            const req = new Request("https://example.com/api", { headers });
            expect(() => validateCsrf(req)).not.toThrow();
        });
    });

    describe("Failure cases", () => {
        it.each([
            ["missing headers", {}, "Missing Origin and Referer headers"],
            ["invalid Origin", { Origin: "https://evil.com" }, "Invalid Origin"],
            ["null Origin", { Origin: "null" }, "Invalid Origin: null"],
            ["invalid Referer", { Referer: "https://evil.com/page" }, "Invalid Referer"],
        ])("should fail with %s", (_, headers, errorMessage) => {
            const req = new Request("https://example.com/api", { headers });
            expect(() => validateCsrf(req)).toThrow(ForbiddenError);
            expect(() => validateCsrf(req)).toThrow(errorMessage);
        });
    });

    it("should fail if NEXT_PUBLIC_APP_URL is not set", () => {
        process.env.NEXT_PUBLIC_APP_URL = "";
        const req = new Request("https://example.com/api", {
            headers: { Origin: validOrigin }
        });
        expect(() => validateCsrf(req)).toThrow(ForbiddenError);
        expect(() => validateCsrf(req)).toThrow("Server configuration error");
    });
});
