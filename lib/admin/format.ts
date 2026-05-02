/**
 * Shared formatting utilities for the admin panel
 * Uses European date format (DD/MM/YYYY)
 */

/**
 * Format a date as DD/MM/YYYY
 */
export function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date
    return d.toLocaleDateString("en-GB") // DD/MM/YYYY
}

/**
 * Format a date and time as DD/MM/YYYY, HH:MM
 */
export function formatDateTime(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date
    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    })
}

/**
 * Format bytes as human-readable string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: bigint | number | string): string {
    const units = ["B", "KB", "MB", "GB", "TB"]
    let value = typeof bytes === "string" ? parseInt(bytes, 10) :
                typeof bytes === "bigint" ? Number(bytes) : bytes

    if (isNaN(value) || value === 0) return "0 B"

    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex++
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return "just now"
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
    if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`

    return formatDate(d)
}

/**
 * Get status badge variant and label for reports
 */
export function getReportStatusInfo(status: string): { variant: "default" | "secondary" | "outline" | "destructive"; label: string; className?: string } {
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

/**
 * Get human-readable label for report reason
 */
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
