import type { FormFieldType, AddressValue } from "@/lib/form-schema"
import { formatAddress, isBlankObject } from "@/lib/form-schema"

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

export function fieldLabelMap(fields: FormFieldMeta[]): Record<string, string> {
    return Object.fromEntries(fields.map((f) => [f.id, f.label]))
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
    const orderedIds =
        fields.length > 0
            ? fields.map((f) => f.id)
            : Array.from(new Set(rows.flatMap((r) => Object.keys(r.answers))))
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
    if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
    return cell
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
