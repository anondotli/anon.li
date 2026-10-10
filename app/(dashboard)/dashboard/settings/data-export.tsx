"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ClipboardList, Download, Loader2, FileJson, Mail, Globe, FileText, Key } from "lucide-react"
import { toast } from "sonner"

/**
 * The export route (and its rate limiter) answer errors as `{ error: string }`,
 * the limiter adding a friendlier `message`. Prefer `message`, then `error`.
 */
async function readExportError(res: Response): Promise<string> {
    const body: unknown = await res.json().catch(() => null)
    if (body && typeof body === "object") {
        const { message, error } = body as { message?: unknown; error?: unknown }
        if (typeof message === "string" && message) return message
        if (typeof error === "string" && error) return error
    }
    return "Export failed"
}

export function DataExportSection() {
    const [loading, setLoading] = useState(false)

    const handleExport = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/user/export")
            if (!res.ok) {
                throw new Error(await readExportError(res))
            }

            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `anon-li-data-export-${new Date().toISOString().split("T")[0]}.json`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            toast.success("Data exported successfully")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to export data")
        } finally {
            setLoading(false)
        }
    }

    const exportItems = [
        { icon: Mail, label: "Email aliases" },
        { icon: Globe, label: "Custom domains" },
        { icon: FileText, label: "Files metadata" },
        { icon: ClipboardList, label: "Form definitions" },
        { icon: Key, label: "PGP key info" },
    ]

    return (
        <Card className="rounded-3xl border-border/40 shadow-sm overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                            <FileJson className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-medium">Export Your Data</CardTitle>
                            <CardDescription className="text-sm">
                                Download a portable summary of your personal workspace
                            </CardDescription>
                        </div>
                    </div>
                    <Button
                        onClick={handleExport}
                        disabled={loading}
                        size="sm"
                        variant="outline"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-xl bg-muted/50 p-4">
                    <p className="text-sm font-medium mb-3">What&apos;s included:</p>
                    <div className="grid grid-cols-2 gap-2">
                        {exportItems.map((item) => (
                            <div key={item.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
                        File contents, encrypted form responses, credential secrets, and team-owned data are not included.
                    </p>
                </div>
            </CardContent>
        </Card>
    )
}
