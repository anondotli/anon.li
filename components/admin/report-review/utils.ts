import type { DropDetails } from "./types"

export const ACTION_DESCRIPTIONS: Record<string, string> = {
    none: "No policy violation found",
    warning: "User notified of policy concern",
    takedown: "Content disabled and user notified",
    ban: "Account restricted from uploads",
}

export const TAKEDOWN_SUGGESTIONS: Record<string, string> = {
    illegal: "Violation of ToS - Illegal content",
    malware: "Violation of ToS - Distribution of malware",
    copyright: "DMCA takedown request - Copyright infringement",
    harassment: "Violation of ToS - Harassment or abuse",
    spam: "Violation of ToS - Spam or misleading content",
    other: "Violation of Terms of Service",
}

export function getDropStatus(drop: DropDetails) {
    if (drop.takenDown) return { label: "Taken Down", variant: "destructive" as const }
    if (drop.disabled) return { label: "Disabled", variant: "secondary" as const }
    if (drop.expiresAt && new Date(drop.expiresAt) < new Date()) return { label: "Expired", variant: "outline" as const }
    return { label: "Active", variant: "default" as const }
}

export function getStrikesBadge(violations: number) {
    if (violations === 0) return { className: "bg-green-500/10 text-green-500 border-green-500/20", label: "0 Strikes" }
    if (violations <= 2) return { className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", label: `${violations} Strike${violations > 1 ? 's' : ''}` }
    return { className: "bg-red-500/10 text-red-500 border-red-500/20", label: `${violations} Strikes` }
}

export function getReasonBadgeClass(reason: string) {
    switch (reason) {
        case "illegal":
        case "malware":
            return "bg-red-500/10 text-red-500 border-red-500/20"
        case "copyright":
        case "harassment":
            return "bg-orange-500/10 text-orange-500 border-orange-500/20"
        case "spam":
            return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
        default:
            return ""
    }
}

export function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
}

export function getFullUrl(resourceId: string, decryptionKey: string) {
    return `${window.location.origin}/d/${resourceId}#${decryptionKey}`
}

export function openFileWithKey(resourceId: string, decryptionKey: string) {
    window.open(`/d/${resourceId}#${decryptionKey}`, '_blank')
}
