/**
 * @vitest-environment jsdom
 */
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SubmissionDetail } from "@/components/form/dashboard/responses/submission-detail"
import { useResponses } from "@/components/form/dashboard/responses/use-responses"
import {
    buildCsv,
    parseDecryptedSubmissionPayload,
    type DecryptedSubmission,
    type FormFieldMeta,
} from "@/components/form/dashboard/responses/shared"

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

describe("decrypted form response payloads", () => {
    it("accepts and normalizes the supported response shape", () => {
        expect(
            parseDecryptedSubmissionPayload(
                JSON.stringify({
                    version: 1,
                    answers: {
                        name: "Ada",
                        score: 5,
                        tags: ["one", "two"],
                        address: { city: "Ljubljana", country: "Slovenia" },
                    },
                    attachments: {
                        dropId: "drop_1",
                        key: "secret-key",
                        files: [
                            {
                                fieldId: "documents",
                                fieldLabel: "Documents",
                                fileId: "file_1",
                                name: "answer.pdf",
                                size: 123,
                                mimeType: "application/pdf",
                            },
                        ],
                    },
                }),
            ),
        ).toEqual({
            answers: {
                name: "Ada",
                score: 5,
                tags: ["one", "two"],
                address: { city: "Ljubljana", country: "Slovenia" },
            },
            attachments: {
                dropId: "drop_1",
                key: "secret-key",
                files: [
                    {
                        fieldId: "documents",
                        fieldLabel: "Documents",
                        fileId: "file_1",
                        name: "answer.pdf",
                        size: 123,
                        mimeType: "application/pdf",
                    },
                ],
            },
        })
    })

    it.each([
        ["invalid JSON", "{"],
        ["a non-object payload", "null"],
        ["answers as an array", JSON.stringify({ answers: [] })],
        ["unsafe nested answer values", JSON.stringify({ answers: { address: { city: 42 } } })],
        ["attachments without a drop", JSON.stringify({ answers: {}, attachments: { files: [] } })],
        [
            "attachments with a non-array file list",
            JSON.stringify({ answers: {}, attachments: { dropId: "drop", key: "key", files: {} } }),
        ],
        ["an unsupported version", JSON.stringify({ version: 2, answers: {}, attachments: null })],
    ])("rejects %s before dashboard components consume it", (_label, plaintext) => {
        expect(() => parseDecryptedSubmissionPayload(plaintext)).toThrow("Invalid submission payload")
    })

    it("isolates a decryptable malicious payload as a row error", async () => {
        responseMocks.fetchWrappedFormKey.mockResolvedValue({
            wrappedKey: "wrapped-key",
            organizationId: null,
        })
        responseMocks.decryptFromSubmission.mockResolvedValue(
            JSON.stringify({ answers: {}, attachments: { dropId: "drop", key: "key", files: {} } }),
        )
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        data: [
                            {
                                id: "malicious00001",
                                created_at: "2026-07-15T10:00:00.000Z",
                                read_at: null,
                                has_attached_drop: true,
                                ephemeral_pub_key: "A".repeat(87),
                                iv: "A".repeat(16),
                                encrypted_payload: "ciphertext",
                            },
                        ],
                        meta: { total: 1 },
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                ),
            ),
        )

        const { result } = renderHook(() =>
            useResponses("form_1", [], { total: 1, unread: 1, withAttachments: 1 }),
        )

        await waitFor(() => {
            expect(result.current.decoded.malicious00001).toEqual({
                status: "error",
                error: "Invalid submission payload",
            })
        })
        expect(result.current.keyError).toBeNull()
    })
})

describe("form response history and CSV safety", () => {
    const fields: FormFieldMeta[] = [
        { id: "current", label: "Current question", type: "short_text" },
    ]

    it("renders answer keys that are no longer present in the current form schema", () => {
        render(
            <SubmissionDetail
                fields={fields}
                meta={{
                    id: "submission_1",
                    createdAt: "2026-07-15T10:00:00.000Z",
                    readAt: null,
                    hasAttachedDrop: false,
                }}
                decoded={{
                    status: "ready",
                    answers: { current: "Current answer", retired_field: "Historical answer" },
                    attachments: null,
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

        expect(screen.getByText("Removed question · retired_field")).toBeTruthy()
        expect(screen.getByText("Historical answer")).toBeTruthy()
    })

    it("includes removed answer keys after current fields in CSV exports", () => {
        const rows: DecryptedSubmission[] = [
            {
                id: "submission_1",
                createdAt: "2026-07-15T10:00:00.000Z",
                answers: { current: "Current answer", retired_field: "Historical answer" },
                attachments: null,
            },
        ]

        expect(buildCsv(fields, rows)).toBe(
            [
                "submission_id,created_at,Current question,retired_field,attachments",
                "submission_1,2026-07-15T10:00:00.000Z,Current answer,Historical answer,",
            ].join("\r\n"),
        )
    })

    it("forces formula-like headers, answers, and attachment names to plain text", () => {
        const rows: DecryptedSubmission[] = [
            {
                id: "submission_1",
                createdAt: "2026-07-15T10:00:00.000Z",
                answers: { current: "=1+1", retired_field: " +2+2", tabbed: "\t=CMD()" },
                attachments: {
                    dropId: "drop_1",
                    key: "key",
                    files: [
                        {
                            fieldId: "file",
                            fileId: "file_1",
                            name: "@SUM(A1:A2)",
                            size: 1,
                            mimeType: "text/plain",
                        },
                    ],
                },
            },
        ]

        const csv = buildCsv([{ ...fields[0]!, label: "=Current question" }], rows)
        expect(csv).toContain("'=Current question")
        expect(csv).toContain("'=1+1")
        expect(csv).toContain("' +2+2")
        expect(csv).toContain("'\t=CMD()")
        expect(csv).toContain("'@SUM(A1:A2)")
    })
})
