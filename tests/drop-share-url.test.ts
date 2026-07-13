import { describe, it, expect } from "vitest";
import { buildDropShareUrl, buildRecipientShareUrl } from "@/lib/drop-share-url";
import { normalizeDropKeyInput, parseDropShareFragment } from "@/lib/drop-link";

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

describe("buildRecipientShareUrl", () => {
    const key = "k".repeat(43);
    const token = "r".repeat(43);

    it("keeps both the key and recipient bearer token out of the query string", () => {
        const url = buildRecipientShareUrl(origin, dropId, token, key, false);

        expect(url).toBe(`${origin}/d/${dropId}#k=${key}&r=${token}`);
        expect(new URL(url).search).toBe("");
        expect(parseDropShareFragment(new URL(url).hash)).toEqual({
            key,
            recipientToken: token,
        });
        expect(normalizeDropKeyInput(url)).toBe(key);
    });

    it("keeps password-drop recipient tokens in a keyless fragment", () => {
        const url = buildRecipientShareUrl(origin, dropId, token, key, true);

        expect(url).toBe(`${origin}/d/${dropId}#r=${token}`);
        expect(parseDropShareFragment(new URL(url).hash)).toEqual({
            key: null,
            recipientToken: token,
        });
    });

    it("continues to parse legacy key-only fragments", () => {
        expect(parseDropShareFragment(`#${key}`)).toEqual({
            key,
            recipientToken: null,
        });
    });
});
