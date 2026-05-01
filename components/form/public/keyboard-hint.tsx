import { cn } from "@/lib/utils"

interface KbdProps {
    children: React.ReactNode
    className?: string
}

export function Kbd({ children, className }: KbdProps) {
    return (
        <kbd
            className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-secondary/60 px-1.5 font-mono text-[10px] font-medium text-foreground/80",
                className,
            )}
        >
            {children}
        </kbd>
    )
}

interface KeyboardHintProps {
    children: React.ReactNode
    className?: string
}

export function KeyboardHint({ children, className }: KeyboardHintProps) {
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
            {children}
        </span>
    )
}

export function PressEnterHint({ label = "to continue", className }: { label?: string; className?: string }) {
    return (
        <KeyboardHint className={className}>
            press <Kbd>Enter ↵</Kbd> {label}
        </KeyboardHint>
    )
}
