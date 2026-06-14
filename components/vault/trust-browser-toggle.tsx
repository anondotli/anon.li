"use client"

import { ShieldCheck } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface TrustBrowserToggleProps {
    id?: string
    checked: boolean
    onCheckedChange: (value: boolean) => void
    /** Whether trusted-browser storage is available in this environment. */
    available: boolean
    /** Extra disable, e.g. while a request is in flight. */
    disabled?: boolean
}

/**
 * "Trust this browser" switch shared by the vault unlock and setup screens.
 * Keeps unlocked state on the device for up to 30 days; surfaces an
 * unavailable note when secure local storage is blocked.
 */
export function TrustBrowserToggle({
    id = "trust-browser",
    checked,
    onCheckedChange,
    available,
    disabled = false,
}: TrustBrowserToggleProps) {
    const locked = disabled || !available

    return (
        <label
            htmlFor={id}
            className={cn(
                "flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 transition-colors hover:bg-muted/50",
                locked && "cursor-default opacity-70 hover:bg-muted/30",
            )}
        >
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-foreground/70" />
                    Trust this browser
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                    Stay unlocked on this browser across tabs and refreshes for up to 30 days.
                </p>
                {!available && (
                    <p className="text-xs text-warning">
                        Unavailable — this browser is blocking secure local storage.
                    </p>
                )}
            </div>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={locked}
                aria-label="Trust this browser"
            />
        </label>
    )
}
