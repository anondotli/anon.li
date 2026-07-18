import type { FormFieldType, AddressValue } from "@/lib/form-schema"
import { formatAddress, isBlankObject } from "@/lib/form-schema"
import { z } from "zod"

// Canonical byte formatter — single source of truth in lib/format.
export { formatBytes } from "@/lib/format"

/**
 * Client-visible metadata for a single form field. Carries enough of the schema
 * (type + choices) to render answers richly in the table/summary and to drive
 * per-field aggregates — without shipping the full builder schema.
 */
export interface FormFieldMeta {
    id: string
    label: string
    type: FormFieldType
    options?: string[]
    min?: number
    max?: number
}

export interface FormMeta {
    id: string
    title: string
    description: string | null
    active: boolean
    disabledByUser: boolean
    takenDown: boolean
    submissionsCount: number
    maxSubmissions: number | null
    closesAt: string | null
    allowFileUploads: boolean
    createdAt: string
    hasOwnerKey: boolean
    fields: FormFieldMeta[]
}

/** Owner-scoped aggregate counts, accurate regardless of how many rows are loaded. */
export interface ResponseStats {
    total: number
    unread: number
    withAttachments: number
}

export interface SubmissionMeta {
    id: string
    createdAt: string
    readAt: string | null
    hasAttachedDrop: boolean
}

interface AttachmentFile {
    fieldId: string
    fieldLabel?: string
    fileId: string
    name: string
    size: number
    mimeType: string
}

export interface DecryptedAttachments {
    dropId: string
    key: string
    files: AttachmentFile[]
}

/** A fully decrypted submission, ready to render or export. */
export interface DecryptedSubmission {
    id: string
    createdAt: string
    answers: Record<string, unknown>
    attachments: DecryptedAttachments | null
}

const AnswerValueSchema = z.union([
    z.string().max(50_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(z.string().max(50_000)).max(100),
    z
        .object({
            line1: z.string().max(200).optional(),
            line2: z.string().max(200).optional(),
            city: z.string().max(120).optional(),
            state: z.string().max(120).optional(),
            postalCode: z.string().max(40).optional(),
            country: z.string().max(120).optional(),
        })
        .strict(),
])

const AnswersSchema = z
    .record(z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/), AnswerValueSchema)
    .refine((answers) => Object.keys(answers).length <= 50, "Too many answers")

const AttachmentsSchema = z
    .object({
        dropId: z.string().min(1).max(128),
        key: z.string().min(1).max(1_024),
        files: z
            .array(
                z
                    .object({
                        fieldId: z.string().min(1).max(64),
                        fieldLabel: z.string().max(300).optional(),
                        fileId: z.string().min(1).max(64),
                        name: z.string().min(1).max(1_024),
                        size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                        mimeType: z.string().min(1).max(200),
                    })
                    .strict(),
            )
            .max(100),
    })
    .strict()

const DecryptedPayloadSchema = z.object({
    // Keep unversioned payloads readable for backwards compatibility while
    // rejecting explicit versions this client does not understand.
    version: z.literal(1).optional(),
    answers: AnswersSchema.optional().default({}),
    attachments: AttachmentsSchema.nullable().optional().default(null),
})

/**
 * Parse untrusted respondent-controlled plaintext after cryptographic
 * decryption. Encryption proves the payload was addressed to this form, not
 * that its shape is safe for dashboard components to consume.
 */
export function parseDecryptedSubmissionPayload(plaintext: string): {
    answers: Record<string, unknown>
    attachments: DecryptedAttachments | null
} {
    let value: unknown
    try {
        value = JSON.parse(plaintext)
    } catch {
        throw new Error("Invalid submission payload")
    }

    const result = DecryptedPayloadSchema.safeParse(value)
    if (!result.success) throw new Error("Invalid submission payload")
    return { answers: result.data.answers, attachments: result.data.attachments }
}

export function fieldLabelMap(fields: FormFieldMeta[]): Record<string, string> {
    return Object.fromEntries(fields.map((f) => [f.id, f.label]))
}

/** Current field ids first, followed by removed/historical ids in encounter order. */
export function orderedAnswerIds(fields: FormFieldMeta[], answerSets: Record<string, unknown>[]): string[] {
    const ids = fields.map((field) => field.id)
    const seen = new Set(ids)
    for (const answers of answerSets) {
        for (const id of Object.keys(answers)) {
            if (seen.has(id)) continue
            seen.add(id)
            ids.push(id)
        }
    }
    return ids
}

export function historicalAnswerEntries(
    fields: FormFieldMeta[],
    answers: Record<string, unknown>,
): Array<[id: string, value: unknown]> {
    const currentIds = new Set(fields.map((field) => field.id))
    return Object.entries(answers).filter(([id]) => !currentIds.has(id))
}

export function isChoiceField(type: FormFieldType): boolean {
    return type === "single_select" || type === "multi_select" || type === "dropdown"
}

/** True when the answer carries no value (empty string, empty list, nullish). */
export function isEmptyAnswer(value: unknown): boolean {
    if (value === null || value === undefined) return true
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === "string") return value.trim() === ""
    if (typeof value === "object") return isBlankObject(value as Record<string, unknown>)
    return false
}

/**
 * Plain-text rendering of an answer value — used for the detail view, search,
 * and as a fallback. Rich rendering (chips, stars) lives in answer-display.tsx.
 */
export function formatAnswerText(value: unknown): string {
    if (isEmptyAnswer(value)) return ""
    if (Array.isArray(value)) return value.map(String).join(", ")
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (typeof value === "object" && value !== null) return formatAddress(value as AddressValue)
    return String(value)
}

/** Lowercased haystack of every answer value, for client-side search. */
export function buildSearchHaystack(answers: Record<string, unknown>): string {
    return Object.values(answers)
        .map((v) => formatAnswerText(v))
        .join(" ")
        .toLowerCase()
}

// ---- Export helpers ---------------------------------------------------------

export function buildCsv(fields: FormFieldMeta[], rows: DecryptedSubmission[]): string {
    const labels = fieldLabelMap(fields)
    const orderedIds = orderedAnswerIds(fields, rows.map((row) => row.answers))
    const header = ["submission_id", "created_at", ...orderedIds.map((id) => labels[id] ?? id), "attachments"]
    const lines = [header.map(csvEscape).join(",")]
    for (const row of rows) {
        const attachmentNames = row.attachments?.files.map((f) => f.name).join("; ") ?? ""
        const cells: string[] = [row.id, row.createdAt]
        for (const id of orderedIds) cells.push(serializeAnswerForCsv(row.answers[id]))
        cells.push(attachmentNames)
        lines.push(cells.map(csvEscape).join(","))
    }
    return lines.join("\r\n")
}

function serializeAnswerForCsv(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (Array.isArray(value)) return value.map(String).join("; ")
    if (typeof value === "boolean") return value ? "true" : "false"
    if (typeof value === "object") return formatAddress(value as AddressValue)
    return String(value)
}

function csvEscape(cell: string): string {
    // Spreadsheet applications can execute cells beginning with these
    // characters as formulas. Prefixing an apostrophe forces text semantics;
    // also catch formulas hidden behind leading whitespace/control characters.
    const formulaLike = /^[\u0000-\u0020\uFEFF]*[=+\-@]/u.test(cell) || /^[\t\r\n]/.test(cell)
    const safeCell = formulaLike ? `'${cell}` : cell
    if (/[",\r\n]/.test(safeCell)) return `"${safeCell.replace(/"/g, '""')}"`
    return safeCell
}

export function triggerDownload(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function safeFilename(input: string): string {
    const slug = input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
    return slug || "form"
}

export function exportTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
}
