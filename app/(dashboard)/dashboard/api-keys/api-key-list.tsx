"use client"

import { Button } from "@/components/ui/button"
import { deleteApiKeyAction } from "@/actions/api-key"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"
import { formatRelativeTime } from "@/lib/utils"

interface ApiKey {
    id: string
    label: string | null
    keyPrefix: string
    createdAt: Date
    lastUsedAt: Date | null
    expiresAt: Date | null
}

interface ApiKeyListProps {
    apiKeys: ApiKey[]
}

export function ApiKeyList({ apiKeys }: ApiKeyListProps) {
    const [deletingId, setDeletingId] = useState<string | null>(null)

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this API key? This action cannot be undone.")) return

        setDeletingId(id)
        try {
            const result = await deleteApiKeyAction(id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("API Key deleted")
            }
        } catch {
            toast.error("Failed to delete key")
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="grid gap-3">
            {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/10">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <p className="font-medium">{key.label || "Untitled Key"}</p>
                            {key.expiresAt && new Date(key.expiresAt) < new Date() && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">Expired</span>
                            )}
                            {key.expiresAt && new Date(key.expiresAt) >= new Date() && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">Expires {formatRelativeTime(key.expiresAt)}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Created {formatRelativeTime(key.createdAt)}</span>
                            <span>•</span>
                            <span className="font-mono">{key.keyPrefix}...</span>
                            {key.lastUsedAt && (
                                <>
                                    <span>•</span>
                                    <span>Last used {formatRelativeTime(key.lastUsedAt)}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(key.id)}
                        disabled={deletingId === key.id}
                    >
                        {deletingId === key.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                </div>
            ))}
        </div>
    )
}
