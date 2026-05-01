"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    AlertTriangle,
    CalendarClock,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Code2,
    Eye,
    Hash,
    Inbox,
    LayoutList,
    ListOrdered,
    Lock,
    Loader2,
    Power,
    Save,
    Settings2,
    ShieldCheck,
    Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useVault } from "@/components/vault/vault-provider"
import { UpgradeRequiredDialog } from "@/components/upgrade/upgrade-required-dialog"
import { generateFormKeypair } from "@/lib/crypto/asymmetric"
import { wrapVaultPayload, base64UrlToArrayBuffer } from "@/lib/vault/crypto"
import { FormSchemaDoc, EMPTY_FORM_SCHEMA, serializeSchema, isFieldVisible } from "@/lib/form-schema"
import type {
    FormField,
    FormSchemaDoc as FormSchemaDocType,
} from "@/lib/form-schema"
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils"
import type { FormEntitlements } from "@/config/plans"
import { createFormAction, updateFormAction } from "@/actions/form"
import { FormBlocksEditor } from "./blocks-editor"
import { FormPasswordDialog, type PasswordPayload } from "./form-password-dialog"
import { QuestionFrame } from "@/components/form/public/question-frame"
import { ClassicFlow } from "@/components/form/public/classic-flow"
import { cn } from "@/lib/utils"

type EditorMode = "build" | "preview" | "json"
type BuilderMode = "create" | "edit"
type BuilderLimits = Pick<FormEntitlements, "removeBranding" | "customKey" | "maxSubmissionFileSize">
type FormTier = "free" | "plus" | "pro"
type NormalizedFormInput = {
    title: string
    description: string | null
    schema: FormSchemaDocType
    allowFileUploads: boolean
    maxSubmissions: number | null
    closesAt: string | null
    hideBranding: boolean
    notifyOnSubmission: boolean
    disabledByUser: boolean
    customKey?: boolean
    salt?: string | null
    customKeyData?: string | null
    customKeyIv?: string | null
    customKeyVerifier?: string | null
}

export interface EditableFormInitial {
    id: string
    title: string
    description: string | null
    schema: FormSchemaDocType
    allowFileUploads: boolean
    maxSubmissions: number | null
    closesAt: string | null
    hideBranding: boolean
    submissionsCount: number
    notifyOnSubmission: boolean
    customKey: boolean
    disabledByUser: boolean
}

interface FormBuilderPageProps {
    mode?: BuilderMode
    initialForm?: EditableFormInitial
    limits?: BuilderLimits
    /** Owner's current form tier — used to power the inline upgrade prompts. */
    currentTier?: FormTier
}

const DEFAULT_LIMITS: BuilderLimits = {
    removeBranding: false,
    customKey: false,
    maxSubmissionFileSize: 0,
}

export function FormBuilderPage({
    mode = "create",
    initialForm,
    limits = DEFAULT_LIMITS,
    currentTier = "free",
}: FormBuilderPageProps) {
    const router = useRouter()
    const vault = useVault()
    const isEdit = mode === "edit"
    const initialSchema = initialForm?.schema ?? EMPTY_FORM_SCHEMA

    const [title, setTitle] = useState(initialForm?.title ?? "")
    const [description, setDescription] = useState(initialForm?.description ?? "")
    const [schema, setSchema] = useState<FormSchemaDocType>(initialSchema)
    const [rawJson, setRawJson] = useState(() => serializeSchema(initialSchema))
    const [jsonError, setJsonError] = useState<string | null>(null)
    const [editorMode, setEditorMode] = useState<EditorMode>("build")
    const [hideBranding, setHideBranding] = useState(initialForm?.hideBranding ?? false)
    const [maxSubmissions, setMaxSubmissions] = useState(
        initialForm?.maxSubmissions != null ? String(initialForm.maxSubmissions) : "",
    )
    const [closesAt, setClosesAt] = useState(() => isoToDateTimeLocal(initialForm?.closesAt ?? null))
    const [notifyOnSubmission, setNotifyOnSubmission] = useState(initialForm?.notifyOnSubmission ?? true)
    const [formActive, setFormActive] = useState(!(initialForm?.disabledByUser ?? false))
    const [passwordEnabled, setPasswordEnabled] = useState(initialForm?.customKey ?? false)
    const [passwordPayload, setPasswordPayload] = useState<PasswordPayload | null>(null)
    const [passwordChanged, setPasswordChanged] = useState(false)
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
    const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({})
    const [hasChanges, setHasChanges] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [upgradeDetails, setUpgradeDetails] = useState<UpgradeRequiredDetails | null>(null)
    // Each field block expands/collapses independently. Default: all collapsed.
    const [expandedFieldIds, setExpandedFieldIds] = useState<Set<string>>(() => new Set())
    const toggleFieldExpansion = useCallback((id: string) => {
        setExpandedFieldIds((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])
    const expandField = useCallback((id: string) => {
        setExpandedFieldIds((current) => {
            if (current.has(id)) return current
            const next = new Set(current)
            next.add(id)
            return next
        })
    }, [])
    const [previewStep, setPreviewStep] = useState(0)

    const hasSubmissions = (initialForm?.submissionsCount ?? 0) > 0

    useEffect(() => {
        if (!hasChanges) return
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ""
        }
        window.addEventListener("beforeunload", onBeforeUnload)
        return () => window.removeEventListener("beforeunload", onBeforeUnload)
    }, [hasChanges])

    const markChanged = useCallback(() => setHasChanges(true), [])

    const updateSchema = useCallback((next: FormSchemaDocType) => {
        setSchema(next)
        setPreviewAnswers({})
        setHasChanges(true)
    }, [])

    const patchSchema = useCallback(
        (patch: Partial<FormSchemaDocType>) => {
            let base = schema
            if (editorMode === "json") {
                try {
                    base = FormSchemaDoc.parse(JSON.parse(rawJson))
                    setJsonError(null)
                } catch (err) {
                    setJsonError(err instanceof Error ? err.message : "Invalid JSON")
                    return
                }
            }
            const next = { ...base, ...patch }
            updateSchema(next)
            if (editorMode === "json") {
                setRawJson(serializeSchema(next))
            }
        },
        [editorMode, rawJson, schema, updateSchema],
    )

    const commitJsonDraft = useCallback(() => {
        try {
            const parsed = FormSchemaDoc.parse(JSON.parse(rawJson))
            setSchema(parsed)
            setJsonError(null)
            return parsed
        } catch (err) {
            setJsonError(err instanceof Error ? err.message : "Invalid JSON")
            return null
        }
    }, [rawJson])

    const handleEditorModeChange = (next: string) => {
        const nextMode = next as EditorMode
        if (nextMode === "json") {
            setRawJson(serializeSchema(schema))
            setJsonError(null)
            setEditorMode("json")
            return
        }
        if (editorMode === "json" && !commitJsonDraft()) {
            return
        }
        setEditorMode(nextMode)
    }

    const saveLabel = isEdit ? "Save changes" : "Create form"
    const disabled = submitting

    const handleSave = async () => {
        const input = buildFormInput({
            title,
            description,
            schema: editorMode === "json" ? commitJsonDraft() : schema,
            hideBranding,
            maxSubmissions,
            closesAt,
            notifyOnSubmission,
            disabledByUser: !formActive,
            passwordEnabled,
            passwordPayload,
            passwordChanged,
            isEdit,
        })

        if ("error" in input) {
            toast.error(input.error)
            return
        }

        setSubmitting(true)
        try {
            if (isEdit && initialForm) {
                const result = await updateFormAction(initialForm.id, input.data)
                if (result.error) {
                    handleActionError(result.error, result.code, result.upgrade, setUpgradeDetails)
                    return
                }
                toast.success("Form saved")
                setSchema(input.data.schema)
                setRawJson(serializeSchema(input.data.schema))
                setHasChanges(false)
                setPasswordChanged(false)
                router.refresh()
                return
            }

            const vaultKey = vault.getVaultKey()
            if (!vaultKey || !vault.vaultId || vault.vaultGeneration == null) {
                toast.error("Please unlock your vault first")
                return
            }

            const keypair = await generateFormKeypair()
            const privateKeyBytes = base64UrlToArrayBuffer(keypair.privateKey)
            const wrappedPrivateKey = await wrapVaultPayload(privateKeyBytes, vaultKey)

            const result = await createFormAction({
                ...input.data,
                description: input.data.description ?? undefined,
                salt: input.data.salt ?? undefined,
                customKeyData: input.data.customKeyData ?? undefined,
                customKeyIv: input.data.customKeyIv ?? undefined,
                customKeyVerifier: input.data.customKeyVerifier ?? undefined,
                publicKey: keypair.publicKey,
                wrappedPrivateKey,
                vaultGeneration: vault.vaultGeneration,
                vaultId: vault.vaultId,
            })

            if (result.error) {
                handleActionError(result.error, result.code, result.upgrade, setUpgradeDetails)
                return
            }
            if (result.formId) {
                toast.success("Form created")
                router.push(`/dashboard/form/${result.formId}`)
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save form")
        } finally {
            setSubmitting(false)
        }
    }

    const previewSchema = useMemo(() => {
        if (editorMode !== "json") return schema
        try {
            return FormSchemaDoc.parse(JSON.parse(rawJson))
        } catch {
            return schema
        }
    }, [editorMode, rawJson, schema])

    const fieldCount = schema.fields.length

    const settingsContent = (
        <SettingsPanel
            schema={schema}
            disabled={disabled}
            isEdit={isEdit}
            hideBranding={hideBranding}
            removeBrandingAllowed={limits.removeBranding}
            customKeyAllowed={limits.customKey}
            currentTier={currentTier}
            onShowUpgrade={setUpgradeDetails}
            maxSubmissions={maxSubmissions}
            closesAt={closesAt}
            notifyOnSubmission={notifyOnSubmission}
            formActive={formActive}
            passwordEnabled={passwordEnabled}
            passwordPending={passwordEnabled && !passwordPayload && !(isEdit && initialForm?.customKey && !passwordChanged)}
            saveLabel={saveLabel}
            submitting={submitting}
            canSave={!disabled && title.trim().length > 0}
            onPatchSchema={patchSchema}
            onToggleHideBranding={(checked) => {
                setHideBranding(checked)
                markChanged()
            }}
            onMaxSubmissionsChange={(value) => {
                setMaxSubmissions(value)
                markChanged()
            }}
            onClosesAtChange={(value) => {
                setClosesAt(value)
                markChanged()
            }}
            onNotifyChange={(checked) => {
                setNotifyOnSubmission(checked)
                markChanged()
            }}
            onActiveChange={(checked) => {
                setFormActive(checked)
                markChanged()
            }}
            onPasswordToggle={(checked) => {
                if (checked && !limits.customKey) {
                    setUpgradeDetails({
                        scope: "form_custom_key",
                        currentTier,
                        suggestedTier: "plus",
                    })
                    return
                }
                setPasswordEnabled(checked)
                setPasswordChanged(true)
                if (!checked) setPasswordPayload(null)
                else setPasswordDialogOpen(true)
                markChanged()
            }}
            onPasswordEdit={() => setPasswordDialogOpen(true)}
            onSave={handleSave}
        />
    )

    return (
        <>
            <UpgradeRequiredDialog
                open={upgradeDetails !== null}
                onOpenChange={(open) => {
                    if (!open) setUpgradeDetails(null)
                }}
                details={upgradeDetails}
            />

            <FormPasswordDialog
                open={passwordDialogOpen}
                onOpenChange={(open) => {
                    setPasswordDialogOpen(open)
                    if (!open && passwordEnabled && !passwordPayload && !(isEdit && initialForm?.customKey)) {
                        // User opened the dialog from enabling the toggle but cancelled — revert.
                        setPasswordEnabled(false)
                        setPasswordChanged(true)
                    }
                }}
                onApply={(payload) => {
                    setPasswordPayload(payload)
                    setPasswordEnabled(true)
                    setPasswordChanged(true)
                    setPasswordDialogOpen(false)
                    markChanged()
                }}
                hasExistingPassword={passwordEnabled && Boolean(initialForm?.customKey)}
            />

            <div className="mx-auto w-full max-w-[1600px]">
                {isEdit && hasSubmissions ? (
                    <div className="px-4 pb-4 sm:px-6">
                        <Alert className="rounded-lg border-amber-500/30 bg-amber-500/10">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Live form with submissions</AlertTitle>
                            <AlertDescription>
                                Edits apply to the public form immediately. Existing encrypted submissions keep their original field IDs.
                            </AlertDescription>
                        </Alert>
                    </div>
                ) : null}

                <div className="grid gap-0 px-4 pb-24 sm:px-6 lg:gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <main className="mx-auto w-full min-w-0 max-w-3xl">
                        <Tabs value={editorMode} onValueChange={handleEditorModeChange}>
                            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                                <TabsList className="h-9 bg-secondary/60">
                                    <TabsTrigger value="build" className="gap-1.5 text-xs">
                                        <Settings2 className="h-3.5 w-3.5" />
                                        Build
                                    </TabsTrigger>
                                    <TabsTrigger value="preview" className="gap-1.5 text-xs">
                                        <Eye className="h-3.5 w-3.5" />
                                        Preview
                                    </TabsTrigger>
                                    <TabsTrigger value="json" className="gap-1.5 text-xs">
                                        <Code2 className="h-3.5 w-3.5" />
                                        JSON
                                    </TabsTrigger>
                                </TabsList>
                                <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    End-to-end encrypted
                                </div>
                            </div>

                            <TabsContent value="build" className="mt-0 space-y-8">
                                <CanvasIntro
                                    title={title}
                                    description={description}
                                    disabled={disabled}
                                    fieldCount={fieldCount}
                                    onTitleChange={(value) => {
                                        setTitle(value)
                                        markChanged()
                                    }}
                                    onDescriptionChange={(value) => {
                                        setDescription(value)
                                        markChanged()
                                    }}
                                />
                                <FormBlocksEditor
                                    schema={schema}
                                    onChange={updateSchema}
                                    disabled={disabled}
                                    maxFileSizeLimit={
                                        limits.maxSubmissionFileSize > 0
                                            ? limits.maxSubmissionFileSize
                                            : undefined
                                    }
                                    expandedIds={expandedFieldIds}
                                    onToggleExpansion={toggleFieldExpansion}
                                    onExpand={expandField}
                                />
                            </TabsContent>

                            <TabsContent value="preview" className="mt-0">
                                <PreviewPanel
                                    title={title}
                                    description={description}
                                    schema={previewSchema}
                                    answers={previewAnswers}
                                    onAnswersChange={setPreviewAnswers}
                                    step={previewStep}
                                    onStepChange={setPreviewStep}
                                    disabled={disabled}
                                />
                            </TabsContent>

                            <TabsContent value="json" className="mt-0">
                                <div className="space-y-4 rounded-xl border border-border/40 bg-card p-5 md:p-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="font-serif text-lg font-medium tracking-tight">Schema JSON</p>
                                            <p className="text-xs font-light text-muted-foreground">
                                                Edit the schema directly. Switching tabs validates first.
                                            </p>
                                        </div>
                                        <span className="rounded-md border border-border/40 bg-secondary/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                            Advanced
                                        </span>
                                    </div>
                                    <Textarea
                                        value={rawJson}
                                        onChange={(event) => {
                                            setRawJson(event.target.value)
                                            setJsonError(null)
                                            markChanged()
                                        }}
                                        rows={24}
                                        className="min-h-[34rem] resize-none border-border/40 font-mono text-xs leading-relaxed"
                                        spellCheck={false}
                                        disabled={disabled}
                                    />
                                    {jsonError ? (
                                        <Alert variant="destructive">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertDescription>{jsonError}</AlertDescription>
                                        </Alert>
                                    ) : null}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </main>

                    <aside className="mx-auto w-full max-w-3xl xl:mx-0 xl:max-w-none">
                        <div className="xl:sticky">{settingsContent}</div>
                    </aside>
                </div>
            </div>

            <span className="sr-only" aria-live="polite">
                {fieldCount === 0
                    ? "No questions yet"
                    : `${fieldCount} ${fieldCount === 1 ? "question" : "questions"}`}
            </span>
        </>
    )
}

function CanvasIntro({
    title,
    description,
    disabled,
    fieldCount,
    onTitleChange,
    onDescriptionChange,
}: {
    title: string
    description: string
    disabled?: boolean
    fieldCount: number
    onTitleChange: (value: string) => void
    onDescriptionChange: (value: string) => void
}) {
    return (
        <section className="space-y-5 border-b border-border/40 pb-8">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Form intro · {String(fieldCount).padStart(2, "0")}{" "}
                {fieldCount === 1 ? "question" : "questions"}
            </span>
            <div className="space-y-3">
                <Label htmlFor="canvas-title" className="sr-only">
                    Form title
                </Label>
                <AutoGrowInput
                    id="canvas-title"
                    value={title}
                    onChange={onTitleChange}
                    disabled={disabled}
                    placeholder="Untitled form"
                    maxLength={200}
                    className="font-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl"
                />
                <Label htmlFor="canvas-description" className="sr-only">
                    Description
                </Label>
                <Textarea
                    id="canvas-description"
                    value={description}
                    onChange={(event) => onDescriptionChange(event.target.value)}
                    placeholder="Write a short intro for respondents (optional)…"
                    disabled={disabled}
                    rows={2}
                    className="resize-none border-transparent bg-transparent px-0 text-base font-light leading-relaxed text-muted-foreground shadow-none transition-colors hover:text-foreground focus-visible:border-transparent focus-visible:text-foreground focus-visible:ring-0"
                    maxLength={2000}
                />
            </div>
        </section>
    )
}

function AutoGrowInput({
    id,
    value,
    onChange,
    disabled,
    placeholder,
    maxLength,
    className,
}: {
    id?: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    placeholder?: string
    maxLength?: number
    className?: string
}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const resizeTextarea = useCallback(() => {
        const textarea = textareaRef.current
        if (!textarea) return

        textarea.style.height = "auto"
        textarea.style.height = `${textarea.scrollHeight}px`
    }, [])

    useLayoutEffect(() => {
        resizeTextarea()
    }, [resizeTextarea, value])

    useEffect(() => {
        window.addEventListener("resize", resizeTextarea)
        return () => window.removeEventListener("resize", resizeTextarea)
    }, [resizeTextarea])

    return (
        <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/\n/g, ""))}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault()
            }}
            disabled={disabled}
            placeholder={placeholder}
            maxLength={maxLength}
            rows={1}
            spellCheck={false}
            className={cn(
                "min-h-0 resize-none overflow-hidden border-transparent bg-transparent px-0 py-1 shadow-none transition-colors hover:border-border/50 focus-visible:border-foreground/40 focus-visible:bg-background focus-visible:ring-0",
                className,
            )}
        />
    )
}

interface SettingsPanelProps {
    schema: FormSchemaDocType
    disabled?: boolean
    isEdit: boolean
    hideBranding: boolean
    removeBrandingAllowed: boolean
    customKeyAllowed: boolean
    currentTier: FormTier
    onShowUpgrade: (details: UpgradeRequiredDetails) => void
    maxSubmissions: string
    closesAt: string
    notifyOnSubmission: boolean
    formActive: boolean
    passwordEnabled: boolean
    passwordPending: boolean
    saveLabel: string
    submitting: boolean
    canSave: boolean
    onPatchSchema: (patch: Partial<FormSchemaDocType>) => void
    onToggleHideBranding: (checked: boolean) => void
    onMaxSubmissionsChange: (value: string) => void
    onClosesAtChange: (value: string) => void
    onNotifyChange: (checked: boolean) => void
    onActiveChange: (checked: boolean) => void
    onPasswordToggle: (checked: boolean) => void
    onPasswordEdit: () => void
    onSave: () => void
}

function SettingsPanel({
    schema,
    disabled,
    isEdit,
    hideBranding,
    removeBrandingAllowed,
    customKeyAllowed,
    currentTier,
    onShowUpgrade,
    maxSubmissions,
    closesAt,
    notifyOnSubmission,
    formActive,
    passwordEnabled,
    passwordPending,
    saveLabel,
    submitting,
    canSave,
    onPatchSchema,
    onToggleHideBranding,
    onMaxSubmissionsChange,
    onClosesAtChange,
    onNotifyChange,
    onActiveChange,
    onPasswordToggle,
    onPasswordEdit,
    onSave,
}: SettingsPanelProps) {
    const displayMode = schema.displayMode ?? "classic"
    // Each section is independently collapsible — multiple can be open at once,
    // and the panel is allowed to have all sections collapsed.
    const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(["experience"]))
    const toggle = (id: string) =>
        setOpenIds((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    return (
        <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Form settings
                </h2>
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>

            <div className="divide-y divide-border/40">
                <SettingsSection
                    id="experience"
                    title="Experience"
                    icon={<LayoutList className="h-3.5 w-3.5" />}
                    open={openIds.has("experience")}
                    onToggle={toggle}
                >
                    <DisplayModeToggle
                        value={displayMode}
                        onChange={(mode) => onPatchSchema({ displayMode: mode })}
                        disabled={disabled}
                    />
                </SettingsSection>

                <SettingsSection
                    id="submission"
                    title="Submission"
                    icon={<Inbox className="h-3.5 w-3.5" />}
                    open={openIds.has("submission")}
                    onToggle={toggle}
                >
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="submit-button-text" className="text-xs">
                                Submit button
                            </Label>
                            <Input
                                id="submit-button-text"
                                value={schema.submitButtonText}
                                onChange={(event) => onPatchSchema({ submitButtonText: event.target.value })}
                                disabled={disabled}
                                placeholder="Submit"
                                maxLength={60}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="thank-you-message" className="text-xs">
                                Thank-you message
                            </Label>
                            <Textarea
                                id="thank-you-message"
                                value={schema.thankYouMessage ?? ""}
                                onChange={(event) =>
                                    onPatchSchema({ thankYouMessage: event.target.value || undefined })
                                }
                                rows={3}
                                placeholder="Shown after a successful submission."
                                disabled={disabled}
                                maxLength={2000}
                                className="resize-none text-sm"
                            />
                        </div>
                        <SwitchRow
                            label="Submission alerts"
                            description="Notify your account email on each response."
                        >
                            <Switch
                                checked={notifyOnSubmission}
                                onCheckedChange={onNotifyChange}
                                disabled={disabled}
                            />
                        </SwitchRow>
                    </div>
                </SettingsSection>

                <SettingsSection
                    id="access"
                    title="Access"
                    icon={<Lock className="h-3.5 w-3.5" />}
                    open={openIds.has("access")}
                    onToggle={toggle}
                >
                    <div className="space-y-3">
                        <div className="space-y-2 rounded-lg border border-border/50 bg-background px-3 py-2.5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-0.5">
                                    <p id="form-password-toggle-label" className="text-xs font-medium">
                                        Password protection
                                    </p>
                                    <p
                                        id="form-password-toggle-desc"
                                        className="text-[11px] text-muted-foreground"
                                    >
                                        {customKeyAllowed
                                            ? "Respondents enter a password to open the form."
                                            : passwordEnabled
                                              ? "Active. You can turn it off, but Plus is required to change or re-enable it."
                                              : "Requires Plus."}
                                    </p>
                                </div>
                                <Switch
                                    checked={passwordEnabled}
                                    onCheckedChange={onPasswordToggle}
                                    // Allow turning OFF an existing password even after a downgrade,
                                    // but block turning a fresh password ON without the entitlement.
                                    disabled={disabled || (!customKeyAllowed && !passwordEnabled)}
                                    aria-labelledby="form-password-toggle-label"
                                    aria-describedby="form-password-toggle-desc"
                                />
                            </div>
                            {!customKeyAllowed && !passwordEnabled ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        onShowUpgrade({
                                            scope: "form_custom_key",
                                            currentTier,
                                            suggestedTier: "plus",
                                        })
                                    }
                                    className="h-8 w-full justify-center gap-1.5 text-xs"
                                >
                                    <Sparkles className="h-3 w-3" />
                                    Upgrade to enable
                                </Button>
                            ) : passwordEnabled && customKeyAllowed ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={onPasswordEdit}
                                    disabled={disabled}
                                    className="h-8 w-full justify-center gap-1.5 text-xs"
                                >
                                    <Lock className="h-3 w-3" />
                                    {passwordPending ? "Set password…" : "Change password"}
                                </Button>
                            ) : null}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="max-submissions" className="text-xs">
                                <span className="inline-flex items-center gap-1.5">
                                    <Hash className="h-3 w-3 text-muted-foreground" />
                                    Max submissions
                                </span>
                            </Label>
                            <Input
                                id="max-submissions"
                                type="number"
                                min={1}
                                value={maxSubmissions}
                                onChange={(event) => onMaxSubmissionsChange(event.target.value)}
                                placeholder="No limit"
                                disabled={disabled}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="closes-at" className="text-xs">
                                <span className="inline-flex items-center gap-1.5">
                                    <CalendarClock className="h-3 w-3 text-muted-foreground" />
                                    Close date
                                </span>
                            </Label>
                            <Input
                                id="closes-at"
                                type="datetime-local"
                                value={closesAt}
                                onChange={(event) => onClosesAtChange(event.target.value)}
                                disabled={disabled}
                                className="h-9"
                            />
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection
                    id="branding"
                    title="Branding"
                    icon={<Sparkles className="h-3.5 w-3.5" />}
                    open={openIds.has("branding")}
                    onToggle={toggle}
                >
                    <div className="space-y-2 rounded-lg border border-border/50 bg-background px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                                <p className="text-xs font-medium">Hide anon.li</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {removeBrandingAllowed
                                        ? "Removes the public footer."
                                        : "Requires Pro."}
                                </p>
                            </div>
                            <Switch
                                checked={hideBranding && removeBrandingAllowed}
                                onCheckedChange={(checked) => {
                                    if (checked && !removeBrandingAllowed) {
                                        onShowUpgrade({
                                            scope: "form_branding",
                                            currentTier,
                                            suggestedTier: "pro",
                                        })
                                        return
                                    }
                                    onToggleHideBranding(checked)
                                }}
                                disabled={disabled || !removeBrandingAllowed}
                            />
                        </div>
                        {!removeBrandingAllowed ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    onShowUpgrade({
                                        scope: "form_branding",
                                        currentTier,
                                        suggestedTier: "pro",
                                    })
                                }
                                className="h-8 w-full justify-center gap-1.5 text-xs"
                            >
                                <Sparkles className="h-3 w-3" />
                                Upgrade to enable
                            </Button>
                        ) : null}
                    </div>
                </SettingsSection>

                <div className="px-3 py-3">
                    <Button
                        type="button"
                        onClick={onSave}
                        disabled={!canSave}
                        className="h-9 w-full justify-center gap-1.5"
                    >
                        {submitting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        <span>{submitting ? "Saving…" : saveLabel}</span>
                    </Button>
                </div>

                {isEdit ? (
                    <SettingsSection
                        id="status"
                        title="Status"
                        icon={<Power className="h-3.5 w-3.5" />}
                        open={openIds.has("status")}
                        onToggle={toggle}
                    >
                        <SwitchRow
                            label="Form is active"
                            description={
                                formActive
                                    ? "Public link accepts submissions."
                                    : "Public link shows a paused notice."
                            }
                        >
                            <Switch
                                checked={formActive}
                                onCheckedChange={onActiveChange}
                                disabled={disabled}
                            />
                        </SwitchRow>
                    </SettingsSection>
                ) : null}
            </div>
        </div>
    )
}

function SettingsSection({
    id,
    title,
    icon,
    children,
    defaultOpen = false,
    open: controlledOpen,
    onToggle,
}: {
    id?: string
    title: string
    icon?: ReactNode
    children: ReactNode
    defaultOpen?: boolean
    open?: boolean
    onToggle?: (id: string) => void
}) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
    const open = controlledOpen ?? uncontrolledOpen
    const toggleOpen = () => {
        if (id && onToggle) {
            onToggle(id)
            return
        }
        setUncontrolledOpen((value) => !value)
    }

    return (
        <section className="px-1">
            <button
                type="button"
                onClick={toggleOpen}
                aria-expanded={open}
                className="group flex w-full items-center gap-2 rounded-md px-3 py-3 text-left transition-colors hover:bg-secondary/30"
            >
                {icon ? <span className="text-muted-foreground">{icon}</span> : null}
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {title}
                </h3>
                <ChevronDown
                    className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open ? <div className="px-3 pb-4 pt-1">{children}</div> : null}
        </section>
    )
}

function DisplayModeToggle({
    value,
    onChange,
    disabled,
}: {
    value: "classic" | "one_question"
    onChange: (mode: "classic" | "one_question") => void
    disabled?: boolean
}) {
    const options: {
        value: "classic" | "one_question"
        label: string
        description: string
        icon: ReactNode
    }[] = [
        {
            value: "one_question",
            label: "One at a time",
            description: "Guided, step-by-step.",
            icon: <ListOrdered className="h-4 w-4" />,
        },
        {
            value: "classic",
            label: "Classic",
            description: "All on one page.",
            icon: <LayoutList className="h-4 w-4" />,
        },
    ]
    return (
        <div className="grid gap-2">
            {options.map((opt) => {
                const selected = value === opt.value
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        disabled={disabled}
                        aria-pressed={selected}
                        className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                            selected
                                ? "border-foreground/40 bg-foreground/5"
                                : "border-border/50 bg-background hover:border-border",
                        )}
                    >
                        <span
                            className={cn(
                                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                                selected ? "bg-foreground text-background" : "bg-secondary",
                            )}
                        >
                            {opt.icon}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

function SwitchRow({
    label,
    description,
    children,
}: {
    label: string
    description: string
    children: ReactNode
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[11px] text-muted-foreground">{description}</p>
            </div>
            {children}
        </div>
    )
}

interface PreviewPanelProps {
    title: string
    description: string
    schema: FormSchemaDocType
    answers: Record<string, unknown>
    onAnswersChange: (next: Record<string, unknown>) => void
    step: number
    onStepChange: (step: number) => void
    disabled?: boolean
}

function PreviewPanel({
    title,
    description,
    schema,
    answers,
    onAnswersChange,
    step,
    onStepChange,
    disabled,
}: PreviewPanelProps) {
    const visibleFields = useMemo(
        () => schema.fields.filter((f) => isFieldVisible(f, answers)),
        [schema.fields, answers],
    )
    const visibleIdsRef = useRef<Set<string>>(new Set(visibleFields.map((f) => f.id)))

    useEffect(() => {
        const next = new Set(visibleFields.map((f) => f.id))
        const removed: string[] = []
        for (const f of schema.fields) {
            if (
                visibleIdsRef.current.has(f.id) &&
                !next.has(f.id) &&
                answers[f.id] !== undefined
            ) {
                removed.push(f.id)
            }
        }
        visibleIdsRef.current = next
        if (removed.length > 0) {
            const copy = { ...answers }
            for (const id of removed) delete copy[id]
            onAnswersChange(copy)
        }
    }, [visibleFields, schema.fields, answers, onAnswersChange])

    if (schema.fields.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border/60 bg-secondary/10 p-12 text-center">
                <p className="font-serif text-2xl font-medium text-muted-foreground">
                    Add a question to see the preview
                </p>
            </div>
        )
    }

    if (schema.displayMode === "classic") {
        return (
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
                <PreviewBadge label="Classic preview" />
                {/* px-* mirrors the FormShell <main> padding the public form gets for free. */}
                <div className="px-6 sm:px-10">
                    <ClassicFlow
                        schema={schema}
                        answers={answers}
                        onChange={onAnswersChange}
                        disabled={disabled}
                        title={title || "Untitled form"}
                        description={description || null}
                        footer={
                            <div className="flex justify-center">
                                <Button disabled className="h-11 px-8">
                                    {schema.submitButtonText || "Submit"}
                                </Button>
                            </div>
                        }
                    />
                </div>
            </div>
        )
    }

    const clampedStep = Math.min(step, Math.max(0, visibleFields.length - 1))
    const current = visibleFields[clampedStep]
    if (!current) return null
    const isLast = clampedStep === visibleFields.length - 1

    return (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
            <PreviewBadge label="Focused preview" />
            <div className="p-6 sm:p-12">
                <QuestionFrame
                    field={current}
                    value={answers[current.id]}
                    onChange={(v) => onAnswersChange({ ...answers, [current.id]: v })}
                    onAdvance={() => {
                        if (!isLast) onStepChange(clampedStep + 1)
                    }}
                    presentation="spotlight"
                    disabled={disabled}
                    error={null}
                    index={clampedStep + 1}
                    total={visibleFields.length}
                    isLast={isLast}
                    submitLabel={isLast ? schema.submitButtonText || "Submit" : undefined}
                />
                <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onStepChange(Math.max(0, clampedStep - 1))}
                        disabled={clampedStep === 0}
                        className="h-8 gap-1.5 text-xs text-muted-foreground"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                    </Button>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {String(clampedStep + 1).padStart(2, "0")} / {String(visibleFields.length).padStart(2, "0")}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onStepChange(Math.min(visibleFields.length - 1, clampedStep + 1))}
                        disabled={isLast}
                        className="h-8 gap-1.5 text-xs text-muted-foreground"
                    >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

function PreviewBadge({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-between border-b border-border/40 bg-secondary/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                {label}
            </span>
            <span className="font-mono normal-case tracking-normal text-muted-foreground/70">
                Read-only
            </span>
        </div>
    )
}

export function buildFormInput({
    title,
    description,
    schema,
    hideBranding,
    maxSubmissions,
    closesAt,
    notifyOnSubmission = true,
    disabledByUser = false,
    passwordEnabled = false,
    passwordPayload = null,
    passwordChanged = false,
    isEdit = false,
}: {
    title: string
    description: string
    schema: FormSchemaDocType | null
    hideBranding: boolean
    maxSubmissions: string
    closesAt: string
    notifyOnSubmission?: boolean
    disabledByUser?: boolean
    passwordEnabled?: boolean
    passwordPayload?: PasswordPayload | null
    passwordChanged?: boolean
    isEdit?: boolean
}): { data: NormalizedFormInput } | { error: string } {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return { error: "Please add a title" }
    if (!schema) return { error: "Fix the JSON before saving" }

    const normalized = normalizeSchemaForSave(schema)
    const parsedSchema = FormSchemaDoc.safeParse(normalized)
    if (!parsedSchema.success) {
        return { error: friendlyZodError(parsedSchema.error.issues, normalized) }
    }

    const allowFileUploads = parsedSchema.data.fields.some((field) => field.type === "file")

    const parsedMaxSubmissions = parseOptionalPositiveInt(maxSubmissions, "Max submissions")
    if ("error" in parsedMaxSubmissions) return parsedMaxSubmissions

    const parsedClosesAt = parseDateTimeLocal(closesAt)
    if ("error" in parsedClosesAt) return parsedClosesAt

    if (passwordEnabled && passwordChanged && !passwordPayload) {
        return { error: "Set a password before saving" }
    }
    if (!isEdit && passwordEnabled && !passwordPayload) {
        return { error: "Set a password before saving" }
    }

    const passwordFields: Pick<NormalizedFormInput, "customKey" | "salt" | "customKeyData" | "customKeyIv" | "customKeyVerifier"> = {}
    if (!isEdit || passwordChanged) {
        passwordFields.customKey = passwordEnabled
        passwordFields.salt = null
        passwordFields.customKeyData = null
        passwordFields.customKeyIv = null
        passwordFields.customKeyVerifier = null
    }

    if (passwordEnabled && (!isEdit || passwordChanged)) {
        if (passwordPayload) {
            passwordFields.salt = passwordPayload.salt
            passwordFields.customKeyData = passwordPayload.customKeyData
            passwordFields.customKeyIv = passwordPayload.customKeyIv
            passwordFields.customKeyVerifier = passwordPayload.customKeyVerifier
        }
    }

    return {
        data: {
            title: trimmedTitle,
            description: description.trim() || null,
            schema: parsedSchema.data,
            allowFileUploads,
            maxSubmissions: parsedMaxSubmissions.value,
            closesAt: parsedClosesAt.value,
            hideBranding,
            notifyOnSubmission,
            disabledByUser,
            ...passwordFields,
        },
    }
}

function normalizeSchemaForSave(schema: FormSchemaDocType): FormSchemaDocType {
    return {
        ...schema,
        submitButtonText: schema.submitButtonText.trim() || "Submit",
        thankYouMessage: schema.thankYouMessage?.trim() || undefined,
        fields: schema.fields.map((field) => {
            const trimmedHelp = field.helpText?.trim()
            const base = {
                ...field,
                label: field.label.trim(),
                helpText: trimmedHelp ? trimmedHelp : undefined,
            } as FormField
            if (
                base.type === "single_select" ||
                base.type === "multi_select" ||
                base.type === "dropdown"
            ) {
                const cleaned = base.options
                    .map((opt: string) => opt.trim())
                    .filter((opt: string) => opt.length > 0)
                return { ...base, options: cleaned.length > 0 ? cleaned : ["Option 1"] }
            }
            return base
        }),
    }
}

function friendlyZodError(
    issues: readonly { path: PropertyKey[]; message: string }[],
    schema: FormSchemaDocType,
): string {
    const issue = issues[0]
    if (!issue) return "Invalid form schema"
    const path = issue.path
    if (path[0] === "fields" && typeof path[1] === "number") {
        const fieldIndex = path[1]
        const field = schema.fields[fieldIndex]
        const labelOrIndex = field?.label?.trim() || `Question ${fieldIndex + 1}`
        const segment = path[2]
        if (segment === "label") return `Add a label to "${labelOrIndex}"`
        if (segment === "options") return `"${labelOrIndex}" needs at least one choice`
        if (segment === "id") return `"${labelOrIndex}" needs a valid field ID`
        return `Fix "${labelOrIndex}": ${issue.message}`
    }
    if (path[0] === "submitButtonText") return "Submit button needs a label"
    return issue.message
}

function handleActionError(
    error: string,
    code: string | undefined,
    upgrade: UpgradeRequiredDetails | undefined,
    setUpgradeDetails: (details: UpgradeRequiredDetails) => void,
) {
    if (code === "UPGRADE_REQUIRED" && upgrade) {
        setUpgradeDetails(upgrade)
        return
    }
    toast.error(error)
}

function parseOptionalPositiveInt(value: string, label: string): { value: number | null } | { error: string } {
    const trimmed = value.trim()
    if (!trimmed) return { value: null }
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { error: `${label} must be a positive whole number` }
    }
    return { value: parsed }
}

function parseDateTimeLocal(value: string): { value: string | null } | { error: string } {
    if (!value) return { value: null }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return { error: "Close date is invalid" }
    return { value: parsed.toISOString() }
}

function isoToDateTimeLocal(value: string | null): string {
    if (!value) return ""
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ""
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
}
