import { useState } from "react"
import { toast } from "sonner"
import { Code2, Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FormMeta } from "./shared"
import { buildCsv, exportTimestamp, fieldLabelMap, safeFilename, triggerDownload } from "./shared"
import type { UseResponsesResult } from "./use-responses"

export function ExportMenu({
    form,
    ensureAllDecrypted,
}: {
    form: FormMeta
    ensureAllDecrypted: UseResponsesResult["ensureAllDecrypted"]
}) {
    const [busy, setBusy] = useState<null | "json" | "csv">(null)

    const run = async (format: "json" | "csv") => {
        if (busy) return
        setBusy(format)
        const toastId = toast.loading("Preparing export…")
        try {
            const decrypted = await ensureAllDecrypted((done, total) => {
                toast.loading(`Decrypting ${done}/${total}…`, { id: toastId })
            })

            if (format === "json") {
                const labels = fieldLabelMap(form.fields)
                const payload = decrypted.map((d) => ({
                    id: d.id,
                    created_at: d.createdAt,
                    answers: d.answers,
                    files:
                        d.attachments?.files.map((f) => ({
                            field_id: f.fieldId,
                            field_label: f.fieldLabel ?? labels[f.fieldId] ?? null,
                            name: f.name,
                            size: f.size,
                            mime_type: f.mimeType,
                        })) ?? [],
                }))
                triggerDownload(
                    JSON.stringify(payload, null, 2),
                    `${safeFilename(form.title)}-${exportTimestamp()}.json`,
                    "application/json",
                )
            } else {
                triggerDownload(
                    buildCsv(form.fields, decrypted),
                    `${safeFilename(form.title)}-${exportTimestamp()}.csv`,
                    "text/csv;charset=utf-8",
                )
            }
            toast.success(`Exported ${decrypted.length} submission${decrypted.length === 1 ? "" : "s"}`, {
                id: toastId,
            })
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Export failed", { id: toastId })
        } finally {
            setBusy(null)
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {busy ? "Exporting…" : "Download"}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => run("json")} disabled={busy !== null}>
                    <Code2 className="mr-2 h-4 w-4" />
                    Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => run("csv")} disabled={busy !== null}>
                    <FileText className="mr-2 h-4 w-4" />
                    Export as CSV
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
