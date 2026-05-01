"use client"

import { useCallback, useRef, useState } from "react"
import { Loader2, AlertCircle, Eye, EyeOff, Lock, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Turnstile } from "@/components/ui/turnstile"
import { cryptoService } from "@/lib/crypto.client"
import { encryptForForm } from "@/lib/crypto/asymmetric"
import type { FormField, FormSchemaDoc } from "@/lib/form-schema"
import { isFieldVisible, validateAnswersAgainstSchema } from "@/lib/form-schema"
import {
    uploadFormAttachments,
    type FormAttachmentProgress,
    type SelectedFormFile,
    type UploadedFormFile,
} from "@/lib/form-file-upload.client"
import { cn } from "@/lib/utils"
import { FormShell } from "./form-shell"
import { WelcomeScreen } from "./welcome-screen"
import { ThankYouScreen } from "./thank-you-screen"
import { OneQuestionFlow } from "./one-question-flow"
import { ClassicFlow } from "./classic-flow"
import { Notice } from "./notice"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export interface PublicFormData {
    id: string
    title: string
    description: string | null
    schema: FormSchemaDoc
    publicKey: string
    active: boolean
    hideBranding: boolean
    closesAt: Date | null
    customKey: boolean
    salt: string | null
    customKeyData: string | null
    customKeyIv: string | null
    allowFileUploads: boolean
}

type Phase =
    | { kind: "welcome" }
    | { kind: "questions" }
    | { kind: "thanks" }

type View =
    | { state: "idle" }
    | { state: "uploading"; progress: FormAttachmentProgress }
    | { state: "submitting" }
    | { state: "error"; message: string }

interface Props {
    form: PublicFormData
}

export function FormSubmissionPage({ form }: Props) {
    const focusedMode = (form.schema.displayMode ?? "classic") === "one_question"
    const [answers, setAnswers] = useState<Record<string, unknown>>({})
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [phase, setPhase] = useState<Phase>(() =>
        focusedMode ? { kind: "welcome" } : { kind: "questions" },
    )
    const [view, setView] = useState<View>({ state: "idle" })
    const [initialNow] = useState(() => Date.now())
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
    const [turnstileRequested, setTurnstileRequested] = useState(false)
    const [turnstileRenderKey, setTurnstileRenderKey] = useState(0)

    const [unlocked, setUnlocked] = useState(false)
    const [customKeyProof, setCustomKeyProof] = useState<string | null>(null)
    const isClosed = !form.active || (form.closesAt && form.closesAt.getTime() < initialNow)
    const isPasswordProtected = form.customKey && !unlocked
    const turnstileRequired = Boolean(turnstileSiteKey)
    const submitting = view.state === "submitting" || view.state === "uploading"
    const onActiveQuestions = phase.kind === "questions" && !isClosed && !isPasswordProtected

    const resetTurnstile = useCallback(() => {
        setTurnstileToken(null)
        setTurnstileRenderKey((k) => k + 1)
    }, [])

    const handleAnswersChange = useCallback((next: Record<string, unknown>) => {
        setAnswers(next)
        setFieldErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev))
    }, [])

    const onSubmit = useCallback(async (verifiedTurnstileToken?: string) => {
        const errors = collectFieldErrors(form.schema, answers)
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            setTurnstileRequested(false)
            setView((current) => (current.state === "error" ? { state: "idle" } : current))
            if (typeof document !== "undefined") {
                const firstId = form.schema.fields.find((f) => errors[f.id])?.id
                if (firstId) {
                    const node = document.querySelector(`[data-field-id="${firstId}"]`)
                    node?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
            }
            return
        }
        setFieldErrors({})

        const tokenForSubmit = verifiedTurnstileToken ?? turnstileToken
        if (turnstileRequired && !tokenForSubmit) {
            setTurnstileRequested(true)
            setView((current) => current.state === "error" ? { state: "idle" } : current)
            return
        }
        if (form.customKey && !customKeyProof) {
            setView({ state: "error", message: "Unlock the form before submitting." })
            return
        }
        setView({ state: "submitting" })
        try {
            const selectedFiles = collectSelectedFiles(form.schema, answers)
            const answerDraft = { ...answers }
            let attachedDropId: string | null = null
            let attachmentUploadToken: string | null = null
            let attachmentManifest: { fieldId: string; fileId: string; size: number; mimeType: string }[] = []
            let uploadedFiles: UploadedFormFile[] = []
            let dropKey: string | null = null

            if (selectedFiles.length > 0) {
                if (!form.allowFileUploads) throw new Error("This form does not accept file uploads")
                const controller = new AbortController()
                const upload = await uploadFormAttachments({
                    formId: form.id,
                    files: selectedFiles,
                    turnstileToken: tokenForSubmit,
                    customKeyProof,
                    signal: controller.signal,
                    onProgress: (progress) => setView({ state: "uploading", progress }),
                })
                attachedDropId = upload.dropId
                attachmentUploadToken = upload.uploadToken
                uploadedFiles = upload.files
                dropKey = upload.keyString
                attachmentManifest = upload.files.map((f) => ({
                    fieldId: f.fieldId,
                    fileId: f.fileId,
                    size: f.encryptedSize,
                    mimeType: f.mimeType,
                }))
                for (const field of form.schema.fields) {
                    if (field.type !== "file") continue
                    const ids = upload.files.filter((f) => f.fieldId === field.id).map((f) => f.fileId)
                    if (ids.length > 0) answerDraft[field.id] = ids
                }
            }

            setView({ state: "submitting" })
            const cleaned = validateAnswersAgainstSchema(form.schema, answerDraft)
            const plaintext = JSON.stringify({
                version: 1,
                answers: cleaned,
                attachments:
                    attachedDropId && dropKey
                        ? {
                              dropId: attachedDropId,
                              key: dropKey,
                              files: uploadedFiles.map((f) => ({
                                  fieldId: f.fieldId,
                                  fieldLabel: f.fieldLabel,
                                  fileId: f.fileId,
                                  name: f.originalName,
                                  size: f.originalSize,
                                  mimeType: f.mimeType,
                              })),
                          }
                        : null,
            })
            const encrypted = await encryptForForm(form.publicKey, plaintext)

            const res = await fetch(`/api/v1/form/${form.id}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...encrypted,
                    ...(attachedDropId ? { attachedDropId } : {}),
                    ...(attachmentUploadToken ? { attachmentUploadToken } : {}),
                    ...(attachmentManifest.length > 0 ? { attachmentManifest } : {}),
                    ...(!attachedDropId && tokenForSubmit ? { turnstileToken: tokenForSubmit } : {}),
                    ...(customKeyProof ? { customKeyProof } : {}),
                }),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                if (turnstileRequired) resetTurnstile()
                throw new Error(body.error?.message ?? body.error ?? `Submission failed (${res.status})`)
            }
            setView({ state: "idle" })
            setPhase({ kind: "thanks" })
        } catch (err) {
            setView({ state: "error", message: err instanceof Error ? err.message : "Submission failed" })
        }
    }, [
        answers,
        form.allowFileUploads,
        form.customKey,
        form.id,
        form.publicKey,
        form.schema,
        customKeyProof,
        turnstileToken,
        turnstileRequired,
        resetTurnstile,
    ])

    const handleTurnstileVerify = useCallback((token: string) => {
        setTurnstileToken(token)
        setTurnstileRequested(false)
        void onSubmit(token)
    }, [onSubmit])

    const submitAnother = useCallback(() => {
        setAnswers({})
        setView({ state: "idle" })
        setTurnstileRequested(false)
        resetTurnstile()
        setPhase(focusedMode ? { kind: "welcome" } : { kind: "questions" })
    }, [resetTurnstile, focusedMode])

    return (
        <FormShell showBranding={!form.hideBranding} showFooter={!onActiveQuestions}>
            {phase.kind === "thanks" ? (
                <ThankYouScreen
                    message={form.schema.thankYouMessage}
                    onSubmitAnother={!isClosed ? submitAnother : undefined}
                />
            ) : isClosed ? (
                <WelcomeScreen
                    title={form.title}
                    description={form.description}
                    questionCount={form.schema.fields.length}
                    onStart={() => undefined}
                    showStart={false}
                >
                    <Notice tone="closed" title="This form is closed" className="mt-8">
                        It is no longer accepting new submissions.
                    </Notice>
                </WelcomeScreen>
            ) : isPasswordProtected ? (
                <WelcomeScreen
                    title={form.title}
                    description={form.description}
                    questionCount={form.schema.fields.length}
                    onStart={() => undefined}
                    showStart={false}
                >
                    <PasswordGate
                        salt={form.salt}
                        customKeyData={form.customKeyData}
                        customKeyIv={form.customKeyIv}
                        onUnlock={(proof) => {
                            setCustomKeyProof(proof)
                            setUnlocked(true)
                        }}
                    />
                </WelcomeScreen>
            ) : phase.kind === "welcome" ? (
                <WelcomeScreen
                    title={form.title}
                    description={form.description}
                    questionCount={form.schema.fields.length}
                    onStart={() => setPhase({ kind: "questions" })}
                    disabled={form.schema.fields.length === 0}
                />
            ) : focusedMode ? (
                <OneQuestionFlow
                    schema={form.schema}
                    answers={answers}
                    onChange={handleAnswersChange}
                    onSubmit={onSubmit}
                    submitButtonText={form.schema.submitButtonText}
                    disabled={submitting}
                    bottomSlot={({ isLast }) => (
                        <FocusedFooter
                            isLast={isLast}
                            view={view}
                            turnstileRequired={turnstileRequired}
                            turnstileRequested={turnstileRequested}
                            turnstileRenderKey={turnstileRenderKey}
                            onVerify={handleTurnstileVerify}
                            onTurnstileError={resetTurnstile}
                            onTurnstileExpire={() => setTurnstileToken(null)}
                        />
                    )}
                />
            ) : (
                <ClassicFlow
                    schema={form.schema}
                    answers={answers}
                    onChange={handleAnswersChange}
                    fieldErrors={fieldErrors}
                    title={form.title}
                    description={form.description}
                    disabled={submitting}
                    footer={
                        <ClassicFooter
                            schema={form.schema}
                            view={view}
                            disabled={submitting}
                            turnstileRequired={turnstileRequired}
                            turnstileRequested={turnstileRequested}
                            turnstileToken={turnstileToken}
                            turnstileRenderKey={turnstileRenderKey}
                            onVerify={handleTurnstileVerify}
                            onTurnstileError={resetTurnstile}
                            onTurnstileExpire={() => setTurnstileToken(null)}
                            onSubmit={onSubmit}
                        />
                    }
                />
            )}
        </FormShell>
    )
}

function collectSelectedFiles(schema: FormSchemaDoc, answers: Record<string, unknown>): SelectedFormFile[] {
    const out: SelectedFormFile[] = []
    for (const field of schema.fields) {
        if (field.type !== "file") continue
        const value = answers[field.id]
        const files = Array.isArray(value) ? value.filter(isFile) : []
        if (files.length > field.maxFiles) {
            throw new Error(`"${field.label}" allows at most ${field.maxFiles} files`)
        }
        for (const file of files) {
            if (!mimeAllowed(file.type || "application/octet-stream", field.acceptedMimeTypes)) {
                throw new Error(`"${file.name}" is not an allowed file type for "${field.label}"`)
            }
            if (field.maxFileSize && file.size > field.maxFileSize) {
                throw new Error(`"${file.name}" exceeds the max size for "${field.label}"`)
            }
            out.push({ fieldId: field.id, fieldLabel: field.label, file })
        }
    }
    return out
}

function isFile(v: unknown): v is File {
    return typeof File !== "undefined" && v instanceof File
}

function isAnswerEmpty(value: unknown): boolean {
    return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
    )
}

function validateFieldAnswer(field: FormField, value: unknown): string | null {
    if (isAnswerEmpty(value)) {
        return field.required ? "This field is required" : null
    }
    switch (field.type) {
        case "email":
            if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return "Enter a valid email address"
            }
            return null
        case "short_text":
        case "long_text":
        case "phone":
        case "date":
            if (typeof value !== "string") return "Must be text"
            if ("maxLength" in field && field.maxLength && value.length > field.maxLength) {
                return `Keep this under ${field.maxLength} characters`
            }
            return null
        case "number": {
            const num = typeof value === "number" ? value : Number(value)
            if (!Number.isFinite(num)) return "Must be a number"
            if (field.min !== undefined && num < field.min) return `Must be at least ${field.min}`
            if (field.max !== undefined && num > field.max) return `Must be at most ${field.max}`
            return null
        }
        case "rating": {
            const num = typeof value === "number" ? value : Number(value)
            if (!Number.isInteger(num) || num < 1 || num > field.max) return `Must be 1–${field.max}`
            return null
        }
        case "single_select":
        case "dropdown":
            if (typeof value !== "string" || !field.options.includes(value)) return "Pick a valid option"
            return null
        case "multi_select":
            if (!Array.isArray(value)) return "Pick at least one option"
            for (const v of value) {
                if (typeof v !== "string" || !field.options.includes(v)) return "Pick a valid option"
            }
            return null
        case "file":
            if (!Array.isArray(value)) return "Attach files to continue"
            if (value.length > field.maxFiles) return `Attach at most ${field.maxFiles} ${field.maxFiles === 1 ? "file" : "files"}`
            return null
    }
}

function collectFieldErrors(
    schema: FormSchemaDoc,
    answers: Record<string, unknown>,
): Record<string, string> {
    const errors: Record<string, string> = {}
    for (const field of schema.fields) {
        if (!isFieldVisible(field, answers)) continue
        const err = validateFieldAnswer(field, answers[field.id])
        if (err) errors[field.id] = err
    }
    return errors
}

function mimeAllowed(mimeType: string, accepted?: Extract<FormField, { type: "file" }>["acceptedMimeTypes"]): boolean {
    if (!accepted || accepted.length === 0) return true
    const m = mimeType.toLowerCase()
    return accepted.some((p) => {
        const pat = p.trim().toLowerCase()
        if (!pat) return false
        if (pat.endsWith("/*")) return m.startsWith(pat.slice(0, -1))
        return m === pat
    })
}

interface FocusedFooterProps {
    isLast: boolean
    view: View
    turnstileRequired: boolean
    turnstileRequested: boolean
    turnstileRenderKey: number
    onVerify: (token: string) => void
    onTurnstileError: () => void
    onTurnstileExpire: () => void
}

function FocusedFooter({
    isLast,
    view,
    turnstileRequired,
    turnstileRequested,
    turnstileRenderKey,
    onVerify,
    onTurnstileError,
    onTurnstileExpire,
}: FocusedFooterProps) {
    return (
        <div className="space-y-4">
            {view.state === "error" ? (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{view.message}</span>
                </div>
            ) : null}
            {view.state === "uploading" ? <AttachmentProgress progress={view.progress} /> : null}
            {view.state === "submitting" ? (
                <div className="inline-flex items-center gap-2 mr-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Encrypting…
                </div>
            ) : null}
            {isLast && turnstileRequired && turnstileRequested ? (
                <Turnstile
                    key={turnstileRenderKey}
                    siteKey={turnstileSiteKey!}
                    onVerify={onVerify}
                    onError={onTurnstileError}
                    onExpire={onTurnstileExpire}
                />
            ) : null}
            <p className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground")}>
                <Shield className="h-3 w-3" />
                Encrypted in your browser before it leaves your device.
            </p>
        </div>
    )
}

interface ClassicFooterProps {
    schema: FormSchemaDoc
    view: View
    disabled: boolean
    turnstileRequired: boolean
    turnstileRequested: boolean
    turnstileToken: string | null
    turnstileRenderKey: number
    onVerify: (token: string) => void
    onTurnstileError: () => void
    onTurnstileExpire: () => void
    onSubmit: () => void | Promise<void>
}

function ClassicFooter({
    schema,
    view,
    disabled,
    turnstileRequired,
    turnstileRequested,
    turnstileToken,
    turnstileRenderKey,
    onVerify,
    onTurnstileError,
    onTurnstileExpire,
    onSubmit,
}: ClassicFooterProps) {
    const submitDisabled = disabled || (turnstileRequired && turnstileRequested && !turnstileToken)
    return (
        <div className="space-y-4">
            {view.state === "error" ? (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{view.message}</span>
                </div>
            ) : null}
            {view.state === "uploading" ? <AttachmentProgress progress={view.progress} /> : null}
            {turnstileRequired && turnstileRequested ? (
                <div className="flex justify-center">
                    <Turnstile
                        key={turnstileRenderKey}
                        siteKey={turnstileSiteKey!}
                        onVerify={onVerify}
                        onError={onTurnstileError}
                        onExpire={onTurnstileExpire}
                    />
                </div>
            ) : null}
            <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                onClick={() => void onSubmit()}
                disabled={submitDisabled}
            >
                {view.state === "uploading" ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading files…
                    </>
                ) : view.state === "submitting" ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Encrypting…
                    </>
                ) : (
                    schema.submitButtonText
                )}
            </Button>
            <p className="inline-flex w-full items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                Encrypted in your browser before it leaves your device.
            </p>
        </div>
    )
}

function AttachmentProgress({ progress }: { progress: FormAttachmentProgress }) {
    const pct =
        progress.totalChunks > 0
            ? Math.round((progress.uploadedChunks / progress.totalChunks) * 100)
            : progress.phase === "preparing"
              ? 5
              : 0
    return (
        <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/30 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">
                    {progress.phase === "preparing" && "Preparing upload"}
                    {progress.phase === "encrypting" && `Encrypting ${progress.currentFileName}`}
                    {progress.phase === "uploading" && `Uploading ${progress.currentFileName}`}
                    {progress.phase === "finalizing" && "Finalizing files"}
                </span>
                <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
        </div>
    )
}

function PasswordGate({
    salt,
    customKeyData,
    customKeyIv,
    onUnlock,
}: {
    salt: string | null
    customKeyData: string | null
    customKeyIv: string | null
    onUnlock: (proof: string) => void
}) {
    const [password, setPassword] = useState("")
    const [reveal, setReveal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const ready = Boolean(salt && customKeyData && customKeyIv)

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (submitting) return
        if (!password || !salt || !customKeyData || !customKeyIv) return
        setSubmitting(true)
        setError(null)
        try {
            const witness = await cryptoService.decryptKeyWithPassword(customKeyData, password, salt, customKeyIv)
            onUnlock(witness)
        } catch {
            setError("That password didn't unlock the form.")
            setPassword("")
            requestAnimationFrame(() => inputRef.current?.focus())
        } finally {
            setSubmitting(false)
        }
    }

    if (!ready) {
        return (
            <Notice tone="lock" title="This form is password-protected" className="mt-8">
                The password material is missing or corrupted. Please ask the form owner to re-set
                the password.
            </Notice>
        )
    }

    return (
        <form
            onSubmit={onSubmit}
            className="mt-10 max-w-md space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
            aria-busy={submitting}
        >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Password-protected form
            </div>
            <p className="text-sm text-muted-foreground">
                Enter the password the form owner shared with you to continue.
            </p>
            <div className="space-y-2">
                <label htmlFor="form-unlock-password" className="sr-only">
                    Password
                </label>
                <div className="relative">
                    <Input
                        ref={inputRef}
                        id="form-unlock-password"
                        name="password"
                        type={reveal ? "text" : "password"}
                        autoFocus
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => {
                            setPassword(event.target.value)
                            if (error) setError(null)
                        }}
                        placeholder="Enter password"
                        disabled={submitting}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? "form-unlock-error" : undefined}
                        className="h-12 pr-11 text-base"
                    />
                    <button
                        type="button"
                        onClick={() => setReveal((v) => !v)}
                        tabIndex={-1}
                        disabled={submitting}
                        aria-label={reveal ? "Hide password" : "Show password"}
                        aria-pressed={reveal}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                {error ? (
                    <p
                        id="form-unlock-error"
                        role="alert"
                        className="flex items-center gap-1.5 text-xs text-destructive"
                    >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {error}
                    </p>
                ) : null}
            </div>
            <Button
                type="submit"
                disabled={submitting || password.length === 0}
                className="h-11 w-full sm:w-auto sm:min-w-[10rem]"
            >
                {submitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying…
                    </>
                ) : (
                    "Unlock form"
                )}
            </Button>
            <p className="pt-1 text-[11px] text-muted-foreground">
                Lost the password? It can&apos;t be recovered — ask the form owner to share it again
                or set a new one.
            </p>
        </form>
    )
}
