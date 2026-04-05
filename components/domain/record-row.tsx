"use client"

import { CheckCircle2, Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface RecordRowProps {
    type: string
    name: string
    value: string
    priority?: string
    verified: boolean
    onCopy: () => void
    icon: React.ReactNode
    label: string
    truncate?: boolean
}

export function RecordRow({
    type,
    name,
    value,
    priority,
    verified,
    onCopy,
    icon,
    label,
    truncate = false
}: RecordRowProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
            <div className="flex items-center gap-3 sm:w-[200px] flex-shrink-0">
                <div className={cn("p-1.5 rounded-md border", verified ? "bg-green-500/10 border-green-500/20 text-green-600" : "bg-muted border-border text-muted-foreground")}>
                    {icon}
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold">{type}</span>
                        {priority && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Priority {priority}</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
            </div>

            <div className="flex-1 flex items-center gap-2 min-w-0">
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        <span className="font-mono">{name}</span>
                        <span>→</span>
                    </div>
                    <code className={cn("bg-muted/50 px-2 py-1 rounded border border-border/50 font-mono text-xs w-full sm:w-auto overflow-hidden text-ellipsis whitespace-nowrap", truncate && "block")}>
                        {value}
                    </code>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={onCopy}>
                    <Copy className="h-3 w-3" />
                </Button>
            </div>

            <div className="flex-shrink-0">
                {verified ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-2 py-1 rounded bg-green-500/5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    </div>
                )}
            </div>
        </div>
    )
}
