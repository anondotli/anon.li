"use client"

import { useId } from "react"
import { toast } from "sonner"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useClipboard } from "@/hooks/use-clipboard"

interface CopyFieldProps {
    label: string
    value: string
    monospace?: boolean
    className?: string
}

/** Read-only value with a one-tap copy button. */
export function CopyField({ label, value, monospace, className }: CopyFieldProps) {
    const id = useId()
    const { copied, copy } = useClipboard(1_500)

    const onCopy = async () => {
        if (await copy(value)) {
            toast.success(`${label} copied`)
        } else {
            toast.error("Copy failed. Select and copy manually.")
        }
    }

    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={id} className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {label}
            </Label>
            <div className="flex items-center gap-2">
                <Input
                    id={id}
                    readOnly
                    value={value}
                    onFocus={(event) => event.currentTarget.select()}
                    className={cn("h-9 text-xs", monospace && "font-mono")}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onCopy}
                    className="h-9 w-9 shrink-0"
                    aria-label={`Copy ${label.toLowerCase()}`}
                >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    )
}
