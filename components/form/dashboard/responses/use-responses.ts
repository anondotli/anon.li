"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVault } from "@/components/vault/vault-provider"
import { fetchWrappedFormKey } from "@/lib/vault/form-keys-client"
import { unwrapVaultPayload, arrayBufferToBase64Url } from "@/lib/vault/crypto"
import { decryptFromSubmission } from "@/lib/crypto/asymmetric"
import type { DecryptedAttachments, DecryptedSubmission, ResponseStats, SubmissionMeta } from "./shared"

const PAGE_SIZE = 100
const DECRYPT_CONCURRENCY = 8

/**
 * Recover the form private-key bytes from its wrapped owner key. Org-owned forms
 * are wrapped to the team's shared org vault key (so any member can decrypt);
 * personal forms use the user's own vault key.
 */
async function recoverFormPrivateKeyBytes(
    vault: ReturnType<typeof useVault>,
    wrapped: { wrappedKey: string; organizationId?: string | null },
): Promise<ArrayBuffer> {
    if (wrapped.organizationId) {
        const handle = await vault.getOrgVaultKeyHandle(wrapped.organizationId)
        if (!handle) {
            throw new Error("You don't have access to this team's encryption key yet. Ask a team admin to grant access.")
        }
        return unwrapVaultPayload(wrapped.wrappedKey, handle.key)
    }
    const vaultKey = vault.getVaultKey()
    if (!vaultKey) throw new Error("Vault is locked")
    return unwrapVaultPayload(wrapped.wrappedKey, vaultKey)
}

interface PayloadRow {
    id: string
    created_at: string
    read_at: string | null
    has_attached_drop: boolean
    ephemeral_pub_key?: string
    iv?: string
    encrypted_payload?: string
}

/** Decryption state for one submission, keyed by id in the cache. */
export type DecodedState =
    | { status: "ready"; answers: Record<string, unknown>; attachments: DecryptedAttachments | null }
    | { status: "error"; error: string }

function toMessage(err: unknown): string {
    return err instanceof Error ? err.message : "Failed to decrypt"
}

function metaOf(row: PayloadRow): SubmissionMeta {
    return {
        id: row.id,
        createdAt: row.created_at,
        readAt: row.read_at,
        hasAttachedDrop: row.has_attached_drop,
    }
}

async function decryptRow(privateKey: string, row: PayloadRow): Promise<DecodedState> {
    if (!row.ephemeral_pub_key || !row.iv || !row.encrypted_payload) {
        return { status: "error", error: "Missing ciphertext" }
    }
    try {
        const plaintext = await decryptFromSubmission(privateKey, {
            ephemeralPubKey: row.ephemeral_pub_key,
            iv: row.iv,
            encryptedPayload: row.encrypted_payload,
        })
        const parsed = JSON.parse(plaintext) as {
            answers?: Record<string, unknown>
            attachments?: DecryptedAttachments | null
        }
        return { status: "ready", answers: parsed.answers ?? {}, attachments: parsed.attachments ?? null }
    } catch (err) {
        return { status: "error", error: toMessage(err) }
    }
}

/** Run async tasks with a bounded number in flight. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const i = cursor++
            if (i >= items.length) break
            out[i] = await fn(items[i] as T)
        }
    })
    await Promise.all(workers)
    return out
}

export interface UseResponsesResult {
    submissions: SubmissionMeta[]
    decoded: Record<string, DecodedState>
    /** Recovering the per-form key failed (e.g. missing org grant). Affects all rows. */
    keyError: string | null
    /** Rows still awaiting decryption. */
    pendingCount: number
    /** Owner-scoped totals (accurate regardless of pagination); updates on read/delete. */
    stats: ResponseStats
    hasMore: boolean
    loadingMore: boolean
    loadMore: () => void
    markRead: (id: string) => void
    removeSubmission: (id: string) => void
    /** Re-fetch and decrypt a single row whose decryption failed. */
    retry: (id: string) => void
    /** Page through + decrypt every submission (used for export); reuses the cache. */
    ensureAllDecrypted: (onProgress?: (done: number, total: number) => void) => Promise<DecryptedSubmission[]>
}

export function useResponses(
    formId: string,
    initialSubmissions: SubmissionMeta[],
    initialStats: ResponseStats,
): UseResponsesResult {
    const vault = useVault()
    const [submissions, setSubmissions] = useState(initialSubmissions)
    const [decoded, setDecoded] = useState<Record<string, DecodedState>>({})
    const [keyError, setKeyError] = useState<string | null>(null)
    const [stats, setStats] = useState<ResponseStats>(initialStats)
    const [loadingMore, setLoadingMore] = useState(false)

    const decodedRef = useRef(decoded)
    const submissionsRef = useRef(submissions)
    const keyPromiseRef = useRef<Promise<string> | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    // How many rows we've already requested ciphertext for (drives pagination).
    const loadedOffsetRef = useRef(0)
    const loadingRef = useRef(false)

    decodedRef.current = decoded
    submissionsRef.current = submissions

    useEffect(() => {
        const controller = new AbortController()
        abortRef.current = controller
        return () => controller.abort()
    }, [])

    const ensureKey = useCallback(() => {
        if (!keyPromiseRef.current) {
            keyPromiseRef.current = (async () => {
                const wrapped = await fetchWrappedFormKey(formId)
                if (!wrapped) {
                    throw new Error("Vault key for this form is missing. Unlock your vault and try again.")
                }
                const bytes = await recoverFormPrivateKeyBytes(vault, wrapped)
                return arrayBufferToBase64Url(bytes)
            })()
            keyPromiseRef.current.catch(() => {
                keyPromiseRef.current = null // allow a retry after unlocking
            })
        }
        return keyPromiseRef.current
    }, [formId, vault])

    const fetchPayloadPage = useCallback(
        async (offset: number): Promise<{ rows: PayloadRow[]; total: number }> => {
            const res = await fetch(
                `/api/v1/form/${formId}/submission?include=payload&limit=${PAGE_SIZE}&offset=${offset}`,
                { credentials: "same-origin", signal: abortRef.current?.signal },
            )
            if (!res.ok) throw new Error(`Failed to load responses (${res.status})`)
            const body = (await res.json()) as { data: PayloadRow[]; meta?: { total?: number } }
            return { rows: body.data ?? [], total: body.meta?.total ?? offset + (body.data?.length ?? 0) }
        },
        [formId],
    )

    // Fetch the next page of ciphertext (one request) and decrypt it locally.
    const loadNextPage = useCallback(async () => {
        if (loadingRef.current) return
        loadingRef.current = true
        setLoadingMore(true)
        try {
            const privateKey = await ensureKey()
            setKeyError(null)
            const offset = loadedOffsetRef.current
            const { rows, total: pageTotal } = await fetchPayloadPage(offset)
            if (abortRef.current?.signal.aborted) return
            loadedOffsetRef.current = offset + rows.length
            setStats((s) => ({ ...s, total: pageTotal }))

            // Show the rows immediately, then fill in decrypted answers.
            setSubmissions((prev) => {
                if (offset === 0) return rows.map(metaOf)
                const seen = new Set(prev.map((s) => s.id))
                return [...prev, ...rows.filter((r) => !seen.has(r.id)).map(metaOf)]
            })

            const results = await mapPool(rows, DECRYPT_CONCURRENCY, (row) => decryptRow(privateKey, row))
            if (abortRef.current?.signal.aborted) return
            setDecoded((prev) => {
                const next = { ...prev }
                rows.forEach((row, i) => {
                    next[row.id] = results[i] as DecodedState
                })
                return next
            })
        } catch (err) {
            setKeyError(toMessage(err))
        } finally {
            loadingRef.current = false
            setLoadingMore(false)
        }
    }, [ensureKey, fetchPayloadPage])

    // Decrypt the first page on mount — exactly once, even if the vault context
    // identity changes (which would otherwise re-fire this and auto-paginate).
    const initRef = useRef(false)
    useEffect(() => {
        if (initRef.current) return
        initRef.current = true
        void loadNextPage()
    }, [loadNextPage])

    const loadMore = useCallback(() => {
        void loadNextPage()
    }, [loadNextPage])

    const markRead = useCallback((id: string) => {
        const target = submissionsRef.current.find((s) => s.id === id)
        if (target && !target.readAt) {
            setStats((s) => ({ ...s, unread: Math.max(0, s.unread - 1) }))
        }
        setSubmissions((prev) =>
            prev.map((s) => (s.id === id && !s.readAt ? { ...s, readAt: new Date().toISOString() } : s)),
        )
        // Persist read state server-side (GET marks read by default). Fire-and-forget.
        void fetch(`/api/v1/form/submission/${id}`, { credentials: "same-origin" }).catch(() => {})
    }, [])

    const removeSubmission = useCallback((id: string) => {
        const target = submissionsRef.current.find((s) => s.id === id)
        setSubmissions((prev) => prev.filter((s) => s.id !== id))
        setDecoded((prev) => {
            if (!(id in prev)) return prev
            const next = { ...prev }
            delete next[id]
            return next
        })
        loadedOffsetRef.current = Math.max(0, loadedOffsetRef.current - 1)
        setStats((s) => ({
            total: Math.max(0, s.total - 1),
            unread: Math.max(0, s.unread - (target && !target.readAt ? 1 : 0)),
            withAttachments: Math.max(0, s.withAttachments - (target?.hasAttachedDrop ? 1 : 0)),
        }))
    }, [])

    const retry = useCallback(
        (id: string) => {
            keyPromiseRef.current = null // a key failure may have caused the error
            void (async () => {
                try {
                    const privateKey = await ensureKey()
                    setKeyError(null)
                    const res = await fetch(`/api/v1/form/submission/${id}?markRead=false`, {
                        credentials: "same-origin",
                        signal: abortRef.current?.signal,
                    })
                    if (!res.ok) throw new Error(`Failed to load submission (${res.status})`)
                    const body = (await res.json()) as { data: PayloadRow }
                    const state = await decryptRow(privateKey, body.data)
                    setDecoded((prev) => ({ ...prev, [id]: state }))
                } catch (err) {
                    setDecoded((prev) => ({ ...prev, [id]: { status: "error", error: toMessage(err) } }))
                }
            })()
        },
        [ensureKey],
    )

    const ensureAllDecrypted = useCallback(
        async (onProgress?: (done: number, total: number) => void): Promise<DecryptedSubmission[]> => {
            const privateKey = await ensureKey()
            const out: DecryptedSubmission[] = []
            const seen = new Set<string>()
            let offset = 0
            let pageTotal = Infinity
            while (offset < pageTotal) {
                const { rows, total: t } = await fetchPayloadPage(offset)
                pageTotal = t
                offset += rows.length
                for (const row of rows) {
                    if (seen.has(row.id)) continue
                    seen.add(row.id)
                    const cached = decodedRef.current[row.id]
                    const state = cached ?? (await decryptRow(privateKey, row))
                    if (state.status === "ready") {
                        out.push({
                            id: row.id,
                            createdAt: row.created_at,
                            answers: state.answers,
                            attachments: state.attachments,
                        })
                    }
                    onProgress?.(out.length, Number.isFinite(pageTotal) ? pageTotal : out.length)
                }
                if (rows.length === 0) break
            }
            return out
        },
        [ensureKey, fetchPayloadPage],
    )

    const pendingCount = useMemo(
        () => submissions.filter((s) => !decoded[s.id]).length,
        [submissions, decoded],
    )

    return {
        submissions,
        decoded,
        keyError,
        pendingCount,
        stats,
        hasMore: submissions.length < stats.total,
        loadingMore,
        loadMore,
        markRead,
        removeSubmission,
        retry,
        ensureAllDecrypted,
    }
}
