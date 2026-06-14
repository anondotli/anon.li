/**
 * @vitest-environment node
 *
 * Track G: org-owned API keys pool their monthly quota by ORG and resolve tier
 * from the ORG's subscriptions; personal keys are unchanged (per-user). Also
 * surfaces organizationId on the validation result for route org-scoping.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthApiKeyRecord, touchApiKeyLastUsed, getAuthUserState, checkApiQuota, hashKey, auth } = vi.hoisted(() => ({
    getAuthApiKeyRecord: vi.fn(),
    touchApiKeyLastUsed: vi.fn(),
    getAuthUserState: vi.fn(),
    checkApiQuota: vi.fn(),
    hashKey: vi.fn(),
    auth: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/data/auth", () => ({ getAuthApiKeyRecord, touchApiKeyLastUsed, getAuthUserState }))
vi.mock("@/lib/api-rate-limit", () => ({ checkApiQuota }))
vi.mock("@/lib/services/api-key", () => ({ ApiKeyService: { hashKey } }))

import { validateApiKey } from "@/lib/api-auth"

const QUOTA_OK = { success: true, limit: 500, remaining: 499, reset: new Date() }
const req = () => new Request("https://x/api/v1/alias", { headers: { authorization: "Bearer ak_test" } })

beforeEach(() => {
    vi.clearAllMocks()
    hashKey.mockReturnValue("hashed")
    touchApiKeyLastUsed.mockResolvedValue(undefined)
    checkApiQuota.mockResolvedValue(QUOTA_OK)
})

describe("validateApiKey — org-scoped quota", () => {
    it("personal key meters quota by user id + user subscriptions", async () => {
        getAuthApiKeyRecord.mockResolvedValue({
            id: "key-1",
            expiresAt: null,
            organizationId: null,
            organizationSubscriptions: null,
            user: {
                id: "user-1",
                banned: false,
                subscriptions: [{ status: "active", product: "alias", tier: "plus", currentPeriodEnd: null }],
                referralPlusUntil: null,
            },
        })

        const res = await validateApiKey(req(), "alias")

        expect(res).not.toBeNull()
        expect(res!.organizationId).toBeNull()
        expect(checkApiQuota).toHaveBeenCalledWith("user-1", expect.objectContaining({ id: "user-1" }), "alias")
    })

    it("org-owned key pools quota by org id + the org's subscriptions", async () => {
        const orgSubs = [{ status: "active", product: "business", tier: "pro", currentPeriodEnd: null }]
        getAuthApiKeyRecord.mockResolvedValue({
            id: "key-2",
            expiresAt: null,
            organizationId: "org-9",
            organizationSubscriptions: orgSubs,
            user: { id: "user-1", banned: false, subscriptions: [], referralPlusUntil: null },
        })

        const res = await validateApiKey(req(), "alias")

        expect(res!.organizationId).toBe("org-9")
        expect(checkApiQuota).toHaveBeenCalledWith("org-9", { subscriptions: orgSubs, referralPlusUntil: null }, "alias")
    })

    it("rejects a key whose owner is banned (org or not)", async () => {
        getAuthApiKeyRecord.mockResolvedValue({
            id: "key-3",
            expiresAt: null,
            organizationId: "org-9",
            organizationSubscriptions: [],
            user: { id: "user-1", banned: true, subscriptions: [], referralPlusUntil: null },
        })

        expect(await validateApiKey(req(), "alias")).toBeNull()
        expect(checkApiQuota).not.toHaveBeenCalled()
    })
})
