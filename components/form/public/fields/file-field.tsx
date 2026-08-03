"use client"

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react"
import { Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/format"
import { getFileIcon } from "@/lib/file-icons"
import type { FieldAccessibilityProps, FieldPresentation } from "./types"
import type { FormField } from "@/lib/form-schema"

interface FileHandle {
    focus: () => void
}

interface Props extends FieldAccessibilityProps {
    field: Extract<FormField, { type: "file" }>
    value: unknown
    onChange: (next: unknown) => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

function isFile(v: unknown): v is File {
    return typeof File !== "undefined" && v instanceof File
}

function mimeAllowed(mimeType: string, accepted?: string[]): boolean {
    if (!accepted || accepted.length === 0) return true
    const m = mimeType.toLowerCase()
    return accepted.some((p) => {
        const pat = p.trim().toLowerCase()
        if (!pat) return false
        if (pat.endsWith("/*")) return m.startsWith(pat.slice(0, -1))
        return m === pat
    })
}

export const FileField = forwardRef<FileHandle, Props>(function FileField(
    { field, value, onChange, presentation, disabled, autoFocus, invalid, describedBy },
    ref,
) {
    const dropRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)
    const [selectionError, setSelectionError] = useState<string | null>(null)

    useImperativeHandle(ref, () => ({ focus: () => dropRef.current?.focus() }), [])
    useEffect(() => {
        if (autoFocus) dropRef.current?.focus()
    }, [autoFocus])

    const files = Array.isArray(value) ? value.filter(isFile) : []
    const remaining = Math.max(0, field.maxFiles - files.length)
    const accept = field.acceptedMimeTypes?.join(",")

    const addFiles = (incoming: File[]) => {
        const valid = incoming.filter((file) => (
            file.size > 0
            && mimeAllowed(file.type || "application/octet-stream", field.acceptedMimeTypes)
            && (!field.maxFileSize || file.size <= field.maxFileSize)
        ))
        const accepted = valid.slice(0, remaining)
        const rejected = incoming.length - accepted.length
        if (accepted.length > 0) onChange([...files, ...accepted])
        if (rejected > 0) {
            const hasEmpty = incoming.some((file) => file.size === 0)
            const hasWrongType = incoming.some((file) => !mimeAllowed(
                file.type || "application/octet-stream",
                field.acceptedMimeTypes,
            ))
            const hasOversized = incoming.some((file) => Boolean(
                field.maxFileSize && file.size > field.maxFileSize,
            ))
            setSelectionError(
                hasEmpty
                    ? "Empty files cannot be attached."
                    : hasWrongType
                      ? "One or more files use a type this question does not accept."
                      : hasOversized
                        ? `One or more files exceed the ${formatBytes(field.maxFileSize!, 0)} limit.`
                        : `This question allows at most ${field.maxFiles} files.`,
            )
        } else {
            setSelectionError(null)
        }
        if (inputRef.current) inputRef.current.value = ""
    }

    const remove = (i: number) => {
        setSelectionError(null)
        onChange(files.filter((_, idx) => idx !== i))
    }

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragOver(false)
        if (disabled || remaining === 0) return
        const dropped = Array.from(e.dataTransfer.files ?? [])
        if (dropped.length > 0) addFiles(dropped)
    }

    const spotlight = presentation === "spotlight"
    const selectionErrorId = selectionError ? `${field.id}-selection-error` : null
    const combinedDescription = [describedBy, selectionErrorId].filter(Boolean).join(" ") || undefined

    return (
        <div className="space-y-3">
            {files.length > 0 ? (
                <ul className={cn("space-y-2", spotlight && "space-y-2.5")}>
                    {files.map((file, i) => {
                        const Icon = getFileIcon(file.name, file.type)
                        return (
                            <li
                                key={`${file.name}-${file.size}-${i}`}
                                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-3"
                            >
                                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => remove(i)}
                                    disabled={disabled}
                                    aria-label={`Remove ${file.name}`}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </li>
                        )
                    })}
                </ul>
            ) : null}

            {remaining > 0 ? (
                <div
                    ref={dropRef}
                    tabIndex={disabled ? -1 : 0}
                    role="button"
                    aria-label={files.length === 0 ? "Attach files" : "Add another file"}
                    aria-disabled={disabled || undefined}
                    aria-describedby={combinedDescription}
                    onClick={() => !disabled && inputRef.current?.click()}
                    onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !disabled) {
                            e.preventDefault()
                            inputRef.current?.click()
                        }
                    }}
                    onDragOver={(e) => {
                        e.preventDefault()
                        if (!disabled) setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    data-drag={dragOver}
                    className={cn(
                        "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 bg-background/40 px-6 py-8 text-center transition-colors",
                        "hover:border-foreground/40 hover:bg-secondary/40",
                        "focus-visible:border-foreground focus-visible:outline-none",
                        "data-[drag=true]:border-foreground data-[drag=true]:bg-secondary/60",
                        disabled && "cursor-not-allowed opacity-60",
                        spotlight && "py-12",
                    )}
                >
                    <Upload className={cn("text-muted-foreground", spotlight ? "h-7 w-7" : "h-5 w-5")} />
                    <p className={cn("font-medium", spotlight ? "text-base" : "text-sm")}>
                        {files.length === 0 ? "Drop files here, or click to browse" : "Add another file"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {files.length}/{field.maxFiles} attached
                        {field.maxFileSize ? ` · ${formatBytes(field.maxFileSize, 0)} max each` : ""}
                    </p>
                </div>
            ) : null}

            {selectionError ? (
                <p id={selectionErrorId ?? undefined} role="alert" className="text-xs text-destructive">
                    {selectionError}
                </p>
            ) : null}

            <input
                ref={inputRef}
                id={field.id}
                type="file"
                multiple={field.maxFiles > 1}
                accept={accept}
                className="hidden"
                onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={combinedDescription}
            />
        </div>
    )
})
