"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createApiKeyAction } from "@/actions/api-key"
import { Loader2, Plus, Copy, Check } from "lucide-react"
import { toast } from "sonner"

export function CreateApiKeyForm() {
    const [isLoading, setIsLoading] = useState(false)
    const [newKey, setNewKey] = useState<string | null>(null)

    async function onSubmit(formData: FormData) {
        setIsLoading(true)
        setNewKey(null)

        try {
            const result = await createApiKeyAction(formData)
            if (result.error) {
                toast.error(result.error)
            } else if (result.data?.key) {
                setNewKey(result.data.key)
                toast.success("API Key created successfully")
            }
        } catch {
            toast.error("An error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    const [hasCopied, setHasCopied] = useState(false)
    const copyToClipboard = async () => {
        if (!newKey) return
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(newKey)
            } else {
                // Fallback for non-secure contexts
                const textArea = document.createElement("textarea")
                textArea.value = newKey
                textArea.style.position = "fixed"
                textArea.style.left = "-999999px"
                document.body.appendChild(textArea)
                textArea.select()
                document.execCommand("copy")
                document.body.removeChild(textArea)
            }
            setHasCopied(true)
            setTimeout(() => setHasCopied(false), 2000)
            toast.success("Copied to clipboard")
        } catch {
            toast.error("Failed to copy to clipboard")
        }
    }

    return (
        <div className="space-y-4">
            {newKey && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-primary">New API Key generated!</p>
                        <p className="text-xs text-muted-foreground">Make sure to copy it now. You won&apos;t be able to see it again.</p>
                        <div className="flex items-center gap-2 mt-2">
                            <code className="flex-1 bg-background p-2 rounded-lg border border-border font-mono text-sm break-all">
                                {newKey}
                            </code>
                            <Button size="icon" variant="ghost" onClick={copyToClipboard}>
                                {hasCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <form action={onSubmit} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="grid w-full gap-1.5 flex-1">
                    <Label htmlFor="label">Label</Label>
                    <Input id="label" name="label" placeholder="e.g. Personal Project" required />
                </div>
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create New Key
                </Button>
            </form>
        </div>
    )
}
