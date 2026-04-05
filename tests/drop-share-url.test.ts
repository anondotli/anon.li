import { describe, it, expect } from "vitest";
import { buildDropShareUrl } from "@/lib/drop-share-url";

const origin = "https://anon.li";
const dropId = "abc123";
const keyString = "someEncryptionKey123456789";

describe("buildDropShareUrl", () => {
    it("appends key hash for normal drops", () => {
        expect(buildDropShareUrl(origin, dropId, keyString, false))
            .toBe(`${origin}/d/${dropId}#${keyString}`);
    });

    it("omits key hash for password-protected (customKey) drops", () => {
        expect(buildDropShareUrl(origin, dropId, keyString, true))
            .toBe(`${origin}/d/${dropId}`);
    });

    it("omits key hash when keyString is null", () => {
        expect(buildDropShareUrl(origin, dropId, null, false))
            .toBe(`${origin}/d/${dropId}`);
    });

    it("omits key hash when both customKey and keyString is null", () => {
        expect(buildDropShareUrl(origin, dropId, null, true))
            .toBe(`${origin}/d/${dropId}`);
    });
});
