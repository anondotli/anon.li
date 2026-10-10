/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SubmissionDetail } from "@/components/form/dashboard/responses/submission-detail"
import { useResponses } from "@/components/form/dashboard/responses/use-responses"
import type { SubmissionMeta } from "@/components/form/dashboard/responses/shared"

const responseMocks = vi.hoisted(() => ({
    decryptFromSubmission: vi.fn(),
    fetchWrappedFormKey: vi.fn(),
}))

vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => ({
        getVaultKey: () => ({ type: "secret" }),
        getOrgVaultKeyHandle: vi.fn(),
    }),
}))
vi.mock("@/lib/vault/form-keys-client", () => ({
    fetchWrappedFormKey: responseMocks.fetchWrappedFormKey,
}))
vi.mock("@/lib/vault/crypto", () => ({
    unwrapVaultPayload: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    arrayBufferToBase64Url: vi.fn().mockReturnValue("private-key"),
}))
vi.mock("@/lib/crypto/asymmetric", () => ({
    decryptFromSubmission: responseMocks.decryptFromSubmission,
}))
vi.mock("@/actions/form", () => ({
    deleteSubmissionAction: vi.fn(),
}))

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

function row(id: string, readAt: string | null, attachedDropId: string | null = null) {
    return {
        id,
        created_at: "2026-07-15T10:00:00.000Z",
        read_at: readAt,
        has_attached_drop: attachedDropId !== null,
        attached_drop_id: attachedDropId,
        ephemeral_pub_key: "A".repeat(87),
        iv: "A".repeat(16),
        encrypted_payload: `cipher${id}`,
    }
}

function pageResponse(rows: ReturnType<typeof row>[]) {
    return new Response(JSON.stringify({ data: rows, meta: { total: rows.length } }), {
        status: 200,
        headers: { "content-type": "application/json" },
    })
}

describe("useResponses", () => {
    it("only PATCHes read state for unread responses", async () => {
        responseMocks.fetchWrappedFormKey.mockResolvedValue({ wrappedKey: "w", organizationId: null })
        responseMocks.decryptFromSubmission.mockResolvedValue(JSON.stringify({ answers: {} }))
        const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === "PATCH") return new Response("{}", { status: 200 })
            return pageResponse([row("readsubmission", "2026-07-15T11:00:00.000Z"), row("unreadsubmissi", null)])
        })
        vi.stubGlobal("fetch", fetchMock)

        const { result } = renderHook(() => useResponses("form_1", [], { total: 2, unread: 1, withAttachments: 0 }))
        await waitFor(() => expect(result.current.submissions).toHaveLength(2))

        act(() => result.current.markRead("readsubmission"))
        act(() => result.current.markRead("unreadsubmissi"))
        // Re-opening an already-marked response is free too.
        act(() => result.current.markRead("unreadsubmissi"))

        const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")
        expect(patches.map(([url]) => url)).toEqual(["/api/v1/form/submission/unreadsubmissi"])
        expect(result.current.stats.unread).toBe(0)
    })

    it("reports rows that could not be decrypted during export instead of dropping them silently", async () => {
        responseMocks.fetchWrappedFormKey.mockResolvedValue({ wrappedKey: "w", organizationId: null })
        responseMocks.decryptFromSubmission.mockImplementation(async (_key: string, { encryptedPayload }: { encryptedPayload: string }) => (
            encryptedPayload === "cipherbrokensubmissi" ? "{" : JSON.stringify({ answers: { name: "Ada" } })
        ))
        vi.stubGlobal("fetch", vi.fn(async () => pageResponse([row("goodsubmission", null), row("brokensubmissi", null)])))

        const { result } = renderHook(() => useResponses("form_1", [], { total: 2, unread: 2, withAttachments: 0 }))
        await waitFor(() => expect(Object.keys(result.current.decoded)).toHaveLength(2))

        const exported = await result.current.ensureAllDecrypted()
        expect(exported.rows.map((r) => r.id)).toEqual(["goodsubmission"])
        expect(exported.failed).toBe(1)
    })
})

describe("SubmissionDetail attachment link", () => {
    function renderDetail(meta: SubmissionMeta, dropId: string) {
        render(
            <SubmissionDetail
                fields={[]}
                meta={meta}
                decoded={{
                    status: "ready",
                    answers: {},
                    attachments: {
                        dropId,
                        key: "secret-key",
                        files: [{ fieldId: "f", fileId: "file1", name: "a.pdf", size: 1, mimeType: "application/pdf" }],
                    },
                }}
                position={{ index: 0, count: 1 }}
                hasPrev={false}
                hasNext={false}
                onPrev={vi.fn()}
                onNext={vi.fn()}
                onRetry={vi.fn()}
                onDelete={vi.fn()}
            />,
        )
    }

    const baseMeta = { id: "submission_1", createdAt: "2026-07-15T10:00:00.000Z", readAt: null, hasAttachedDrop: true }

    it("links to the drop the server attached", () => {
        renderDetail({ ...baseMeta, attachedDropId: "drop_real" }, "drop_real")
        expect(screen.getByRole("link", { name: /open drop/i }).getAttribute("href")).toBe("/d/drop_real#secret-key")
    })

    it("hides the link when the respondent-controlled dropId doesn't match", () => {
        renderDetail({ ...baseMeta, attachedDropId: "drop_real" }, "someone_elses_drop")
        expect(screen.queryByRole("link", { name: /open drop/i })).toBeNull()
        expect(screen.getByText("a.pdf")).toBeTruthy()
    })
})
