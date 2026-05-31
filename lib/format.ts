/**
 * Canonical formatting helpers.
 *
 * Single source of truth for byte, date, and relative-time formatting used by
 * both the user-facing UI and the admin panel. Previously these existed twice
 * (`lib/utils.ts` and `lib/admin/format.ts`) with divergent output.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const

/**
 * Format a byte count as a human-readable string (e.g. "1.5 MB").
 * Accepts number, bigint, or numeric string. Bytes (the "B" unit) never show
 * decimals; larger units show up to `decimals` places with trailing zeros trimmed.
 */
export function formatBytes(bytes: number | bigint | string, decimals: number = 2): string {
    const value =
        typeof bytes === "string"
            ? parseInt(bytes, 10)
            : typeof bytes === "bigint"
              ? Number(bytes)
              : bytes

    if (!Number.isFinite(value) || value === 0) return "0 B"

    const k = 1024
    const i = Math.min(Math.floor(Math.log(value) / Math.log(k)), BYTE_UNITS.length - 1)
    const dm = i === 0 ? 0 : Math.max(decimals, 0)
    return `${parseFloat((value / Math.pow(k, i)).toFixed(dm))} ${BYTE_UNITS[i]}`
}

/** Format a date as DD/MM/YYYY (en-GB). */
export function formatDate(date: Date | string | number): string {
    return new Date(date).toLocaleDateString("en-GB")
}

/** Format a date and time as DD/MM/YYYY, HH:MM (en-GB). */
export function formatDateTime(date: Date | string | number): string {
    return new Date(date).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })
}

const RELATIVE_INTERVALS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
]

/** Format a date as relative time (e.g. "2 hours ago", "yesterday", "just now"). */
export function formatRelativeTime(date: Date | string | number): string {
    const diffInSeconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (diffInSeconds < 60) return "just now"

    for (const [unit, seconds] of RELATIVE_INTERVALS) {
        const interval = Math.floor(diffInSeconds / seconds)
        if (interval >= 1) {
            return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-interval, unit)
        }
    }
    return "just now"
}

/** Status badge variant and label for abuse reports (admin panel). */
export function getReportStatusInfo(status: string): {
    variant: "default" | "secondary" | "outline" | "destructive"
    label: string
    className?: string
} {
    switch (status) {
        case "pending":
            return { variant: "outline", label: "Pending", className: "text-yellow-500 border-yellow-500" }
        case "reviewed":
            return { variant: "secondary", label: "Reviewed" }
        case "resolved":
            return { variant: "default", label: "Resolved" }
        case "dismissed":
            return { variant: "outline", label: "Dismissed" }
        default:
            return { variant: "outline", label: status }
    }
}

/** Human-readable label for an abuse report reason (admin panel). */
export function getReasonLabel(reason: string): string {
    const labels: Record<string, string> = {
        spam: "Spam",
        illegal: "Illegal Content",
        harassment: "Harassment",
        copyright: "Copyright",
        malware: "Malware",
        other: "Other"
    }
    return labels[reason] || reason
}
