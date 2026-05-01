"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
    AlignLeft,
    ArrowDown,
    ArrowUp,
    Asterisk,
    Calendar,
    ChevronDown,
    ChevronsUpDown,
    Circle,
    CircleDot,
    Copy,
    GripVertical,
    Hash,
    ListChecks,
    Mail,
    MoreHorizontal,
    Paperclip,
    Phone,
    Plus,
    Settings2,
    Square,
    Star,
    Trash2,
    Type,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type {
    FormField,
    FormFieldType,
    FormFieldVisibility,
    FormFieldVisibilityOp,
    FormSchemaDoc,
} from "@/lib/form-schema"
import {
    createField,
    convertField,
    bytesToMegabytes,
    megabytesToBytes,
} from "@/lib/form-field-utils"

export { createField } from "@/lib/form-field-utils"

const MIME_REORDER = "application/x-form-reorder-index"

interface FieldTypeInfo {
    value: FormFieldType
    label: string
    description: string
    icon: LucideIcon
}

export const FIELD_TYPES: FieldTypeInfo[] = [
    { value: "short_text", label: "Short text", description: "Single-line answer", icon: Type },
    { value: "long_text", label: "Long text", description: "Multi-line answer", icon: AlignLeft },
    { value: "email", label: "Email", description: "Validated email address", icon: Mail },
    { value: "number", label: "Number", description: "Numeric input with optional range", icon: Hash },
    { value: "phone", label: "Phone", description: "Phone number", icon: Phone },
    { value: "single_select", label: "Single choice", description: "Pick one with radios", icon: CircleDot },
    { value: "multi_select", label: "Multiple choice", description: "Pick many with checkboxes", icon: ListChecks },
    { value: "dropdown", label: "Dropdown", description: "Pick one from a list", icon: ChevronsUpDown },
    { value: "rating", label: "Rating", description: "1–10 star rating", icon: Star },
    { value: "date", label: "Date", description: "Calendar date picker", icon: Calendar },
    { value: "file", label: "File upload", description: "Accept encrypted file uploads", icon: Paperclip },
]

const FIELD_TYPE_MAP: Record<FormFieldType, FieldTypeInfo> = FIELD_TYPES.reduce((acc, info) => {
    acc[info.value] = info
    return acc
}, {} as Record<FormFieldType, FieldTypeInfo>)

interface Props {
    schema: FormSchemaDoc
    onChange: (next: FormSchemaDoc) => void
    disabled?: boolean
    maxFileSizeLimit?: number
    /** Controlled set of field ids whose editors are expanded. */
    expandedIds?: Set<string>
    /** Toggle a single field's expanded state. */
    onToggleExpansion?: (id: string) => void
    /** Force-expand a field (used when adding/duplicating so the new field opens for editing). */
    onExpand?: (id: string) => void
}

export function FormBlocksEditor({
    schema,
    onChange,
    disabled,
    maxFileSizeLimit,
    expandedIds: expandedIdsProp,
    onToggleExpansion: onToggleExpansionProp,
    onExpand: onExpandProp,
}: Props) {
    const [reorderIndex, setReorderIndex] = useState<number | null>(null)
    const [dropTarget, setDropTarget] = useState<number | null>(null)
    const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(() => new Set())
    const expandedIds = expandedIdsProp ?? internalExpandedIds
    const internalToggleExpansion = useCallback((id: string) => {
        setInternalExpandedIds((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])
    const internalExpand = useCallback((id: string) => {
        setInternalExpandedIds((current) => {
            if (current.has(id)) return current
            const next = new Set(current)
            next.add(id)
            return next
        })
    }, [])
    const toggleExpansion = onToggleExpansionProp ?? internalToggleExpansion
    const expand = onExpandProp ?? internalExpand

    const update = useCallback(
        (next: Partial<FormSchemaDoc>) => onChange({ ...schema, ...next }),
        [onChange, schema],
    )

    const updateField = useCallback(
        (index: number, patch: Partial<FormField>) => {
            const next = schema.fields.slice()
            next[index] = { ...(next[index] as FormField), ...patch } as FormField
            update({ fields: next })
        },
        [schema.fields, update],
    )

    const replaceField = useCallback(
        (index: number, field: FormField) => {
            const next = schema.fields.slice()
            next[index] = field
            update({ fields: next })
        },
        [schema.fields, update],
    )

    const insertField = useCallback(
        (type: FormFieldType, atIndex?: number) => {
            const newField = createField(type, schema.fields, maxFileSizeLimit)
            const next = schema.fields.slice()
            if (atIndex === undefined || atIndex >= next.length) {
                next.push(newField)
            } else {
                next.splice(atIndex, 0, newField)
            }
            update({ fields: next })
            expand(newField.id)
        },
        [schema.fields, update, maxFileSizeLimit, expand],
    )

    const removeField = (index: number) => {
        const next = schema.fields.slice()
        next.splice(index, 1)
        update({ fields: next })
    }

    const moveField = (from: number, to: number) => {
        if (from === to || from < 0 || to < 0 || from >= schema.fields.length || to >= schema.fields.length) return
        const next = schema.fields.slice()
        const [field] = next.splice(from, 1)
        if (!field) return
        next.splice(to, 0, field)
        update({ fields: next })
    }

    const duplicateField = (index: number) => {
        const source = schema.fields[index]
        if (!source) return
        const copy: FormField = {
            ...source,
            id: createField(source.type, schema.fields).id,
        } as FormField
        const next = schema.fields.slice()
        next.splice(index + 1, 0, copy)
        update({ fields: next })
        expand(copy.id)
    }

    if (schema.fields.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 p-8 sm:p-10">
                <div className="mx-auto max-w-md space-y-2 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/50 bg-background">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="font-serif text-2xl font-medium tracking-tight">
                        Add your first question
                    </h3>
                    <p className="text-sm font-light leading-relaxed text-muted-foreground">
                        Pick a question type to begin. You can reorder, duplicate, and add logic later.
                    </p>
                </div>
                <div className="mx-auto mt-6 max-w-md">
                    <FieldTypePalette
                        layout="grid"
                        onAdd={(type) => insertField(type)}
                        disabled={disabled}
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {schema.fields.map((field, index) => {
                const isSelected = expandedIds.has(field.id)
                const isDragging = reorderIndex === index
                const isDropTarget = dropTarget === index && reorderIndex !== null && reorderIndex !== index
                return (
                    <div key={field.id}>
                        {index > 0 ? (
                            <BetweenInsert
                                onAdd={(type) => insertField(type, index)}
                                disabled={disabled}
                            />
                        ) : null}
                        <div
                            onDragOver={(event) => {
                                if (disabled || reorderIndex === null) return
                                event.preventDefault()
                                event.dataTransfer.dropEffect = "move"
                                setDropTarget(index)
                            }}
                            onDrop={(event) => {
                                event.preventDefault()
                                if (reorderIndex !== null) moveField(reorderIndex, index)
                                setReorderIndex(null)
                                setDropTarget(null)
                            }}
                            className={cn(
                                "group relative rounded-xl border transition-colors",
                                isSelected
                                    ? "border-foreground/30 bg-card luxury-shadow-sm"
                                    : "border-border/40 bg-secondary/20 hover:border-border/60 hover:bg-card",
                                isDragging && "opacity-40",
                                isDropTarget && "ring-2 ring-primary/40",
                            )}
                        >
                            <FieldRow
                                field={field}
                                index={index}
                                total={schema.fields.length}
                                selected={isSelected}
                                disabled={disabled}
                                onClick={() => toggleExpansion(field.id)}
                                onDragStart={(event) => {
                                    if (disabled) return
                                    setReorderIndex(index)
                                    event.dataTransfer.effectAllowed = "move"
                                    event.dataTransfer.setData(MIME_REORDER, String(index))
                                    event.dataTransfer.setData("text/plain", String(index))
                                }}
                                onDragEnd={() => {
                                    setReorderIndex(null)
                                    setDropTarget(null)
                                }}
                                onLabelChange={(label) => updateField(index, { label })}
                                onRequiredChange={(required) => updateField(index, { required })}
                                onMoveUp={() => moveField(index, index - 1)}
                                onMoveDown={() => moveField(index, index + 1)}
                                onDuplicate={() => duplicateField(index)}
                                onDelete={() => removeField(index)}
                            />

                            {isSelected ? (
                                <div className="space-y-4 border-t border-border/40 bg-secondary/10 px-4 py-5 sm:px-5">
                                    <FieldEditor
                                        field={field}
                                        fieldIndex={index}
                                        allFields={schema.fields}
                                        disabled={disabled}
                                        maxFileSizeLimit={maxFileSizeLimit}
                                        onPatch={(patch) => updateField(index, patch)}
                                        onTypeChange={(type) =>
                                            replaceField(
                                                index,
                                                convertField(field, type, schema.fields, maxFileSizeLimit),
                                            )
                                        }
                                    />
                                    <FieldActions
                                        fieldName={field.label || `Question ${index + 1}`}
                                        index={index}
                                        total={schema.fields.length}
                                        required={field.required}
                                        disabled={disabled}
                                        onMoveUp={() => moveField(index, index - 1)}
                                        onMoveDown={() => moveField(index, index + 1)}
                                        onDuplicate={() => duplicateField(index)}
                                        onRequiredChange={(required) => updateField(index, { required })}
                                        onDelete={() => removeField(index)}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </div>
                )
            })}
            <AddQuestionMenu onAdd={(type) => insertField(type)} disabled={disabled} />
        </div>
    )
}

function BetweenInsert({
    onAdd,
    disabled,
}: {
    onAdd: (type: FormFieldType) => void
    disabled?: boolean
}) {
    return (
        <div className="group/insert relative my-1 h-2">
            <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-border/40 opacity-0 transition-opacity group-hover/insert:opacity-100" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={disabled}
                            aria-label="Insert question here"
                            className="h-6 w-6 rounded-full border-border/50 bg-background opacity-0 shadow-sm transition-opacity group-hover/insert:opacity-100 data-[state=open]:opacity-100"
                        >
                            <Plus className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-60">
                        {FIELD_TYPE_GROUPS.map((group, groupIndex) => (
                            <div key={group.label}>
                                {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {group.label}
                                </DropdownMenuLabel>
                                {group.types.map((type) => {
                                    const info = FIELD_TYPE_MAP[type]
                                    const Icon = info.icon
                                    return (
                                        <DropdownMenuItem
                                            key={info.value}
                                            onSelect={() => onAdd(info.value)}
                                            className="gap-2 text-sm"
                                        >
                                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {info.label}
                                        </DropdownMenuItem>
                                    )
                                })}
                            </div>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

const FIELD_TYPE_GROUPS: { label: string; types: FormFieldType[] }[] = [
    { label: "Text", types: ["short_text", "long_text", "email", "phone"] },
    { label: "Choice", types: ["single_select", "multi_select", "dropdown"] },
    { label: "Number & date", types: ["number", "rating", "date"] },
    { label: "File", types: ["file"] },
]

function AddQuestionMenu({
    onAdd,
    disabled,
}: {
    onAdd: (type: FormFieldType) => void
    disabled?: boolean
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className="h-9 w-full justify-center gap-1.5 rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground hover:border-foreground/40 hover:bg-secondary/30 hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add question
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-60">
                {FIELD_TYPE_GROUPS.map((group, groupIndex) => (
                    <div key={group.label}>
                        {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                        </DropdownMenuLabel>
                        {group.types.map((type) => {
                            const info = FIELD_TYPE_MAP[type]
                            const Icon = info.icon
                            return (
                                <DropdownMenuItem
                                    key={info.value}
                                    onSelect={() => onAdd(info.value)}
                                    className="gap-2 text-sm"
                                >
                                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                    {info.label}
                                </DropdownMenuItem>
                            )
                        })}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface FieldTypePaletteProps {
    onAdd: (type: FormFieldType) => void
    disabled?: boolean
    className?: string
    /** "list" = vertical full-width buttons (sidebar); "grid" = 2-column tiles (popovers). */
    layout?: "list" | "grid"
}

export function FieldTypePalette({
    onAdd,
    disabled,
    className,
    layout = "list",
}: FieldTypePaletteProps) {
    if (layout === "grid") {
        return (
            <div className={cn("grid grid-cols-2 gap-1.5", className)}>
                {FIELD_TYPES.map((type) => (
                    <FieldTypeButton key={type.value} info={type} onAdd={onAdd} disabled={disabled} compact />
                ))}
            </div>
        )
    }
    return (
        <div className={cn("space-y-1", className)}>
            {FIELD_TYPES.map((type) => (
                <FieldTypeButton key={type.value} info={type} onAdd={onAdd} disabled={disabled} />
            ))}
        </div>
    )
}

function FieldTypeButton({
    info,
    onAdd,
    disabled,
    compact,
}: {
    info: FieldTypeInfo
    onAdd: (type: FormFieldType) => void
    disabled?: boolean
    compact?: boolean
}) {
    const Icon = info.icon
    return (
        <button
            type="button"
            onClick={() => onAdd(info.value)}
            disabled={disabled}
            title={info.description}
            className={cn(
                "group flex w-full items-center gap-2.5 rounded-md border border-border/50 bg-background px-2.5 text-left text-sm transition-colors",
                "hover:border-foreground/30 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
                compact ? "py-2" : "py-2.5",
            )}
        >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary/60 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{info.label}</span>
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
    )
}

interface FieldRowProps {
    field: FormField
    index: number
    total: number
    selected: boolean
    disabled?: boolean
    onClick: () => void
    onDragStart: (event: React.DragEvent) => void
    onDragEnd: () => void
    onLabelChange: (label: string) => void
    onRequiredChange: (required: boolean) => void
    onMoveUp: () => void
    onMoveDown: () => void
    onDuplicate: () => void
    onDelete: () => void
}

function FieldRow({
    field,
    index,
    total,
    selected,
    disabled,
    onClick,
    onDragStart,
    onDragEnd,
    onLabelChange,
    onRequiredChange,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onDelete,
}: FieldRowProps) {
    const typeInfo = FIELD_TYPE_MAP[field.type]
    const Icon = typeInfo.icon
    const fieldName = field.label || `Question ${index + 1}`

    return (
        <div
            className="group/row relative flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-3.5"
            onClick={onClick}
            role="button"
            tabIndex={-1}
        >
            <button
                type="button"
                draggable={!disabled}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Drag ${fieldName}`}
                className="mt-1 inline-flex h-8 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
                disabled={disabled}
            >
                <GripVertical className="h-4 w-4" />
            </button>

            <span
                className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors",
                    selected
                        ? "border-foreground/40 bg-foreground/5 text-foreground"
                        : "border-border/40 bg-background text-muted-foreground",
                )}
                aria-hidden
            >
                <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1 space-y-1" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                        {typeInfo.label}
                    </span>
                    {field.required ? (
                        <span className="text-[11px] text-destructive/80">Required</span>
                    ) : null}
                    {field.visibleWhen ? (
                        <span className="text-[11px] text-muted-foreground">· Logic</span>
                    ) : null}
                </div>
                <Input
                    aria-label={`Label for ${fieldName}`}
                    value={field.label}
                    onChange={(event) => onLabelChange(event.target.value)}
                    placeholder="Untitled question"
                    disabled={disabled}
                    className="h-auto border-transparent bg-transparent px-0 py-0.5 font-serif text-lg font-medium leading-snug tracking-tight shadow-none focus-visible:border-border focus-visible:bg-background sm:text-xl"
                />
            </div>

            <div className="flex items-center gap-0.5" onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground/60 transition-colors hover:text-foreground data-[state=open]:text-foreground"
                            aria-label={`Actions for ${fieldName}`}
                            disabled={disabled}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={onClick} className="gap-2 text-sm">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {selected ? "Close editor" : "Edit"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => onRequiredChange(!field.required)}
                            className="gap-2 text-sm"
                        >
                            <Asterisk className="h-3.5 w-3.5 text-muted-foreground" />
                            {field.required ? "Make optional" : "Make required"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onDuplicate} className="gap-2 text-sm">
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={onMoveUp}
                            disabled={index === 0}
                            className="gap-2 text-sm"
                        >
                            <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                            Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={onMoveDown}
                            disabled={index === total - 1}
                            className="gap-2 text-sm"
                        >
                            <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                            Move down
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={onDelete}
                            className="gap-2 text-sm text-destructive focus:text-destructive"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={(event) => {
                        event.stopPropagation()
                        onClick()
                    }}
                    aria-label={`${selected ? "Collapse" : "Expand"} ${fieldName}`}
                    aria-expanded={selected}
                    disabled={disabled}
                >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", selected && "rotate-180")} />
                </Button>
            </div>
        </div>
    )
}

interface FieldActionsProps {
    fieldName: string
    index: number
    total: number
    required: boolean
    disabled?: boolean
    onMoveUp: () => void
    onMoveDown: () => void
    onDuplicate: () => void
    onRequiredChange: (required: boolean) => void
    onDelete: () => void
}

function FieldActions({
    fieldName,
    index,
    total,
    required,
    disabled,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onRequiredChange,
    onDelete,
}: FieldActionsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
            <Button
                variant="ghost"
                size="sm"
                onClick={onMoveUp}
                disabled={disabled || index === 0}
                aria-label={`Move ${fieldName} up`}
                className="h-8 gap-1.5 text-xs text-muted-foreground"
            >
                <ArrowUp className="h-3.5 w-3.5" />
                Up
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={onMoveDown}
                disabled={disabled || index === total - 1}
                aria-label={`Move ${fieldName} down`}
                className="h-8 gap-1.5 text-xs text-muted-foreground"
            >
                <ArrowDown className="h-3.5 w-3.5" />
                Down
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={onDuplicate}
                disabled={disabled}
                aria-label={`Duplicate ${fieldName}`}
                className="h-8 gap-1.5 text-xs text-muted-foreground"
            >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                Required
                <Switch
                    checked={required}
                    onCheckedChange={onRequiredChange}
                    disabled={disabled}
                    aria-label={`Required for ${fieldName}`}
                />
            </label>
            <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={disabled}
                aria-label={`Delete ${fieldName}`}
                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
            >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
            </Button>
        </div>
    )
}

function FieldEditor({
    field,
    fieldIndex,
    allFields,
    disabled,
    maxFileSizeLimit,
    onPatch,
    onTypeChange,
}: {
    field: FormField
    fieldIndex: number
    allFields: FormField[]
    disabled?: boolean
    maxFileSizeLimit?: number
    onPatch: (patch: Partial<FormField>) => void
    onTypeChange: (type: FormFieldType) => void
}) {
    return (
        <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                        value={field.type}
                        onValueChange={(type) => onTypeChange(type as FormFieldType)}
                        disabled={disabled}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FIELD_TYPES.map((type) => {
                                const Icon = type.icon
                                return (
                                    <SelectItem key={type.value} value={type.value}>
                                        <span className="inline-flex items-center gap-2">
                                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                            {type.label}
                                        </span>
                                    </SelectItem>
                                )
                            })}
                        </SelectContent>
                    </Select>
                </div>
                <TextInputSetting
                    label="Field ID"
                    hint="Used in submissions. Letters, numbers, _ or -."
                    value={field.id}
                    onChange={(value) => onPatch({ id: value } as Partial<FormField>)}
                    disabled={disabled}
                    monospace
                />
                <TextInputSetting
                    label="Help text"
                    hint="Shown as a subtle line below the question."
                    value={field.helpText ?? ""}
                    onChange={(value) => onPatch({ helpText: value || undefined } as Partial<FormField>)}
                    disabled={disabled}
                    className="md:col-span-2"
                />
            </div>

            <TypeSpecificOptions
                field={field}
                onChange={onPatch}
                disabled={disabled}
                maxFileSizeLimit={maxFileSizeLimit}
            />

            <VisibleWhenEditor
                fieldIndex={fieldIndex}
                allFields={allFields}
                value={field.visibleWhen}
                onChange={(visibleWhen) => onPatch({ visibleWhen } as Partial<FormField>)}
                disabled={disabled}
            />
        </div>
    )
}

const VISIBILITY_OPS: { value: FormFieldVisibilityOp; label: string; needsValue: boolean }[] = [
    { value: "equals", label: "equals", needsValue: true },
    { value: "notEquals", label: "does not equal", needsValue: true },
    { value: "contains", label: "contains", needsValue: true },
    { value: "gt", label: "is greater than", needsValue: true },
    { value: "lt", label: "is less than", needsValue: true },
    { value: "isNotEmpty", label: "has any answer", needsValue: false },
    { value: "isEmpty", label: "is empty", needsValue: false },
]

function VisibleWhenEditor({
    fieldIndex,
    allFields,
    value,
    onChange,
    disabled,
}: {
    fieldIndex: number
    allFields: FormField[]
    value: FormFieldVisibility | undefined
    onChange: (rule: FormFieldVisibility | undefined) => void
    disabled?: boolean
}) {
    const eligible = allFields.slice(0, fieldIndex)
    const ruleEnabled = value !== undefined
    const targetField = value ? allFields.find((f) => f.id === value.fieldId) : undefined
    const opInfo = VISIBILITY_OPS.find((op) => op.value === value?.op)

    const enableRule = () => {
        const first = eligible[0]
        if (!first) return
        onChange({ fieldId: first.id, op: "isNotEmpty" })
    }

    return (
        <div className="space-y-3 rounded-lg border border-border/50 bg-background p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium">Show only if…</p>
                    <p className="text-xs text-muted-foreground">
                        Conditionally display this question based on an earlier answer.
                    </p>
                </div>
                <Switch
                    checked={ruleEnabled}
                    onCheckedChange={(checked) => (checked ? enableRule() : onChange(undefined))}
                    disabled={disabled || eligible.length === 0}
                    aria-label="Enable visibility rule"
                />
            </div>

            {eligible.length === 0 && !ruleEnabled ? (
                <p className="text-xs text-muted-foreground">
                    Add an earlier question before creating a visibility rule.
                </p>
            ) : null}

            {ruleEnabled && value ? (
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                        <Label className="text-xs">When field</Label>
                        <Select
                            value={value.fieldId}
                            onValueChange={(fieldId) => onChange({ ...value, fieldId })}
                            disabled={disabled}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {eligible.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>
                                        <span className="truncate">{f.label || f.id}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Condition</Label>
                        <Select
                            value={value.op}
                            onValueChange={(op) => {
                                const nextOp = op as FormFieldVisibilityOp
                                const nextInfo = VISIBILITY_OPS.find((x) => x.value === nextOp)
                                const next: FormFieldVisibility = { ...value, op: nextOp }
                                if (!nextInfo?.needsValue) delete next.value
                                onChange(next)
                            }}
                            disabled={disabled}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VISIBILITY_OPS.map((op) => (
                                    <SelectItem key={op.value} value={op.value}>
                                        {op.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {opInfo?.needsValue ? (
                        <div className="space-y-1">
                            <Label className="text-xs">Value</Label>
                            <VisibilityValueInput
                                targetField={targetField}
                                op={value.op}
                                value={value.value}
                                onChange={(next) => onChange({ ...value, value: next })}
                                disabled={disabled}
                            />
                        </div>
                    ) : null}

                    {!targetField ? (
                        <p className="text-xs text-destructive sm:col-span-3">
                            The target field was removed. Pick another or disable this rule.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

function VisibilityValueInput({
    targetField,
    op,
    value,
    onChange,
    disabled,
}: {
    targetField: FormField | undefined
    op: FormFieldVisibilityOp
    value: string | number | null | undefined
    onChange: (next: string | number | null) => void
    disabled?: boolean
}) {
    const isNumericOp = op === "gt" || op === "lt"
    const isNumericField = targetField?.type === "number" || targetField?.type === "rating"

    if (
        targetField &&
        (targetField.type === "single_select" ||
            targetField.type === "dropdown" ||
            targetField.type === "multi_select")
    ) {
        return (
            <Select
                value={typeof value === "string" ? value : ""}
                onValueChange={(v) => onChange(v)}
                disabled={disabled}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                    {targetField.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                            {opt}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )
    }

    if (isNumericOp || isNumericField) {
        return (
            <Input
                type="number"
                value={value === null || value === undefined ? "" : String(value)}
                onChange={(event) => {
                    const raw = event.target.value
                    if (raw === "") {
                        onChange(null)
                        return
                    }
                    const parsed = Number(raw)
                    onChange(Number.isFinite(parsed) ? parsed : raw)
                }}
                disabled={disabled}
            />
        )
    }

    return (
        <Input
            value={typeof value === "string" ? value : value != null ? String(value) : ""}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
        />
    )
}

function TypeSpecificOptions({
    field,
    onChange,
    disabled,
    maxFileSizeLimit,
}: {
    field: FormField
    onChange: (patch: Partial<FormField>) => void
    disabled?: boolean
    maxFileSizeLimit?: number
}) {
    switch (field.type) {
        case "short_text":
        case "long_text":
            return (
                <div className="grid gap-4 md:grid-cols-2">
                    <TextInputSetting
                        label="Placeholder"
                        value={field.placeholder ?? ""}
                        onChange={(value) =>
                            onChange({ placeholder: value || undefined } as Partial<FormField>)
                        }
                        disabled={disabled}
                    />
                    <NumberSetting
                        label="Max length"
                        value={field.maxLength}
                        min={1}
                        max={field.type === "short_text" ? 500 : 50_000}
                        onChange={(value) => onChange({ maxLength: value } as Partial<FormField>)}
                        disabled={disabled}
                    />
                </div>
            )
        case "email":
        case "phone":
            return (
                <div className="grid gap-4 md:grid-cols-2">
                    <TextInputSetting
                        label="Placeholder"
                        value={field.placeholder ?? ""}
                        onChange={(value) =>
                            onChange({ placeholder: value || undefined } as Partial<FormField>)
                        }
                        disabled={disabled}
                    />
                </div>
            )
        case "number":
            return (
                <div className="grid gap-4 md:grid-cols-3">
                    <NumberSetting
                        label="Min"
                        value={field.min}
                        onChange={(value) => onChange({ min: value } as Partial<FormField>)}
                        disabled={disabled}
                    />
                    <NumberSetting
                        label="Max"
                        value={field.max}
                        onChange={(value) => onChange({ max: value } as Partial<FormField>)}
                        disabled={disabled}
                    />
                    <NumberSetting
                        label="Step"
                        value={field.step}
                        min={0.000001}
                        onChange={(value) => onChange({ step: value } as Partial<FormField>)}
                        disabled={disabled}
                    />
                </div>
            )
        case "date":
            return (
                <div className="grid gap-4 md:grid-cols-2">
                    <TextInputSetting
                        label="Min date"
                        type="date"
                        value={field.min ?? ""}
                        onChange={(value) =>
                            onChange({ min: value || undefined } as Partial<FormField>)
                        }
                        disabled={disabled}
                    />
                    <TextInputSetting
                        label="Max date"
                        type="date"
                        value={field.max ?? ""}
                        onChange={(value) =>
                            onChange({ max: value || undefined } as Partial<FormField>)
                        }
                        disabled={disabled}
                    />
                </div>
            )
        case "rating":
            return (
                <div className="grid gap-4 md:grid-cols-2">
                    <NumberSetting
                        label="Maximum rating"
                        hint="Between 3 and 10."
                        value={field.max}
                        min={3}
                        max={10}
                        onChange={(value) => onChange({ max: value ?? 5 } as Partial<FormField>)}
                        disabled={disabled}
                    />
                </div>
            )
        case "file":
            return (
                <div className="grid gap-4 md:grid-cols-3">
                    <NumberSetting
                        label="Max files"
                        value={field.maxFiles}
                        min={1}
                        max={20}
                        onChange={(value) => onChange({ maxFiles: value ?? 1 } as Partial<FormField>)}
                        disabled={disabled}
                    />
                    <NumberSetting
                        label="Max size (MB)"
                        value={
                            field.maxFileSize
                                ? bytesToMegabytes(field.maxFileSize)
                                : defaultMaxFileMegabytes(maxFileSizeLimit)
                        }
                        min={1}
                        max={maxFileSizeLimit ? bytesToMegabytes(maxFileSizeLimit) : undefined}
                        placeholder={
                            maxFileSizeLimit ? `${bytesToMegabytes(maxFileSizeLimit)} MB` : "Plan limit"
                        }
                        onChange={(value) =>
                            onChange({
                                maxFileSize: value ? megabytesToBytes(value) : maxFileSizeLimit,
                            } as Partial<FormField>)
                        }
                        disabled={disabled}
                    />
                    <TextInputSetting
                        label="Accepted types"
                        hint="Comma-separated MIME types."
                        value={field.acceptedMimeTypes?.join(", ") ?? ""}
                        onChange={(value) => {
                            const acceptedMimeTypes = value
                                .split(",")
                                .map((part) => part.trim())
                                .filter(Boolean)
                            onChange({
                                acceptedMimeTypes:
                                    acceptedMimeTypes.length > 0 ? acceptedMimeTypes : undefined,
                            } as Partial<FormField>)
                        }}
                        placeholder="image/*, application/pdf"
                        disabled={disabled}
                    />
                </div>
            )
        case "single_select":
        case "multi_select":
        case "dropdown":
            return (
                <OptionEditor
                    fieldType={field.type}
                    options={field.options}
                    onChange={(options) => onChange({ options } as Partial<FormField>)}
                    disabled={disabled}
                />
            )
        default:
            return null
    }
}

const OPTION_BULLET: Record<"single_select" | "multi_select" | "dropdown", LucideIcon> = {
    single_select: Circle,
    multi_select: Square,
    dropdown: ChevronsUpDown,
}

const OPTION_LIMIT: Record<"single_select" | "multi_select" | "dropdown", number> = {
    single_select: 50,
    multi_select: 50,
    dropdown: 100,
}

function OptionEditor({
    fieldType,
    options,
    onChange,
    disabled,
}: {
    fieldType: "single_select" | "multi_select" | "dropdown"
    options: string[]
    onChange: (opts: string[]) => void
    disabled?: boolean
}) {
    const Bullet = OPTION_BULLET[fieldType]
    const limit = OPTION_LIMIT[fieldType]
    const canAdd = !disabled && options.length < limit
    const inputsRef = useRef<(HTMLInputElement | null)[]>([])
    const pendingFocus = useRef<{ index: number; caret: number } | null>(null)

    useEffect(() => {
        const target = pendingFocus.current
        if (!target) return
        const input = inputsRef.current[target.index]
        if (input) {
            input.focus()
            const caret = Math.min(target.caret, input.value.length)
            input.setSelectionRange(caret, caret)
        }
        pendingFocus.current = null
    }, [options])

    const updateAt = (index: number, value: string) => {
        const next = options.slice()
        next[index] = value
        onChange(next)
    }

    const removeAt = (index: number, focusPrev = false) => {
        if (options.length <= 1) return
        if (focusPrev && index > 0) {
            const prevLength = options[index - 1]?.length ?? 0
            pendingFocus.current = { index: index - 1, caret: prevLength }
        }
        onChange(options.filter((_, i) => i !== index))
    }

    const splitAt = (index: number, caret: number) => {
        if (!canAdd) return
        const current = options[index] ?? ""
        const before = current.slice(0, caret)
        const after = current.slice(caret)
        const next = options.slice()
        next[index] = before
        next.splice(index + 1, 0, after)
        pendingFocus.current = { index: index + 1, caret: 0 }
        onChange(next)
    }

    const appendDefault = () => {
        if (!canAdd) return
        const nextIndex = options.length
        pendingFocus.current = { index: nextIndex, caret: 0 }
        onChange([...options, `Option ${options.length + 1}`])
    }

    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between">
                <Label>Choices</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                    {options.length}
                    <span className="text-muted-foreground/60"> / {limit}</span>
                </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/50 bg-background">
                {options.map((option, index) => (
                    <div
                        key={index}
                        className="group/option flex items-center gap-1 border-b border-border/40 px-1.5 py-1 last:border-b-0"
                    >
                        <Bullet
                            className="h-4 w-4 shrink-0 text-muted-foreground/50"
                            aria-hidden
                        />
                        <Input
                            ref={(el) => {
                                inputsRef.current[index] = el
                            }}
                            value={option}
                            onChange={(event) => updateAt(index, event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                                    event.preventDefault()
                                    if (!canAdd) return
                                    const target = event.currentTarget
                                    const caret = target.selectionStart ?? option.length
                                    splitAt(index, caret)
                                } else if (
                                    event.key === "Backspace" &&
                                    option === "" &&
                                    options.length > 1
                                ) {
                                    event.preventDefault()
                                    removeAt(index, true)
                                }
                            }}
                            placeholder={`Option ${index + 1}`}
                            disabled={disabled}
                            aria-label={`Option ${index + 1}`}
                            className="h-8 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/60 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/option:opacity-100 sm:opacity-0"
                            onClick={() => removeAt(index)}
                            disabled={disabled || options.length <= 1}
                            aria-label={`Remove option ${index + 1}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={appendDefault}
                    disabled={!canAdd}
                    className="flex w-full items-center gap-2 border-t border-border/40 px-1.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add option</span>
                    <span className="ml-auto hidden items-center gap-1 text-[10px] text-muted-foreground/60 sm:inline-flex">
                        Press
                        <kbd className="rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-[10px] text-muted-foreground/80">
                            Enter
                        </kbd>
                    </span>
                </button>
            </div>
        </div>
    )
}

function TextInputSetting({
    label,
    hint,
    value,
    onChange,
    disabled,
    placeholder,
    type = "text",
    monospace,
    className,
}: {
    label: string
    hint?: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    placeholder?: string
    type?: "text" | "date"
    monospace?: boolean
    className?: string
}) {
    const id = useId()
    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className={monospace ? "font-mono text-xs" : undefined}
            />
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    )
}

function NumberSetting({
    label,
    hint,
    value,
    onChange,
    disabled,
    min,
    max,
    placeholder,
}: {
    label: string
    hint?: string
    value?: number
    onChange: (value: number | undefined) => void
    disabled?: boolean
    min?: number
    max?: number
    placeholder?: string
}) {
    const id = useId()
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type="number"
                min={min}
                max={max}
                placeholder={placeholder}
                value={value ?? ""}
                onChange={(event) => {
                    const raw = event.target.value
                    if (raw === "") {
                        onChange(undefined)
                        return
                    }
                    const parsed = Number(raw)
                    if (Number.isFinite(parsed)) onChange(parsed)
                }}
                disabled={disabled}
            />
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    )
}

function defaultMaxFileMegabytes(maxFileSizeLimit?: number): number | undefined {
    return maxFileSizeLimit ? bytesToMegabytes(maxFileSizeLimit) : undefined
}
