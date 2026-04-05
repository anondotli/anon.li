import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { customAlphabet } from "nanoid"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function generateRandomString(length: number = 6): string {
    const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", length)
    return nanoid()
}

export function formatRelativeTime(date: Date | string | number): string {
    const now = new Date()
    const target = new Date(date)
    const diffInSeconds = Math.floor((now.getTime() - target.getTime()) / 1000)

    if (diffInSeconds < 60) return "just now"

    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    }

    for (const [unit, seconds] of Object.entries(intervals)) {
        const interval = Math.floor(diffInSeconds / seconds)
        if (interval >= 1) {
            return new Intl.RelativeTimeFormat("en", { numeric: "auto" })
                .format(-interval, unit as Intl.RelativeTimeFormatUnit)
        }
    }

    return "just now"
}

export function formatBytes(bytes: number | bigint, decimals: number = 2): string {
    const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes
    if (numBytes === 0) return "0 B"

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"]

    const i = Math.floor(Math.log(numBytes) / Math.log(k))
    return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export function sanitizeEmailSubject(input: string, maxLength: number = 100): string {
    let sanitized = input.replace(/[\r\n]/g, " ")
    sanitized = sanitized.replace(/\0/g, "")
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    sanitized = sanitized.replace(/\s+/g, " ").trim()

    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength - 3) + "..."
    }

    return sanitized
}

export function sanitizeFilename(filename: string, maxLength: number = 255): string {
    let sanitized = filename.replace(/\.\./g, "")
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "")
    sanitized = sanitized.replace(/[<>:"/\\|?*]/g, "_")
    sanitized = sanitized.replace(/_+/g, "_")
    sanitized = sanitized.replace(/^[_\s]+|[_\s]+$/g, "")

    if (sanitized.length > maxLength) {
        const lastDot = sanitized.lastIndexOf(".")
        if (lastDot > 0 && lastDot > sanitized.length - 10) {
            const ext = sanitized.substring(lastDot)
            const name = sanitized.substring(0, maxLength - ext.length - 3)
            sanitized = name + "..." + ext
        } else {
            sanitized = sanitized.substring(0, maxLength - 3) + "..."
        }
    }

    if (!sanitized) {
        sanitized = "unnamed"
    }

    return sanitized
}

export function sanitizeDomain(domain: string): string {
    let sanitized = domain.toLowerCase().trim()
    sanitized = sanitized.replace(/^https?:\/\//, "")
    sanitized = sanitized.split("/")[0] || ""
    sanitized = sanitized.split(":")[0] || ""
    sanitized = sanitized.replace(/[^a-z0-9.-]/g, "")
    sanitized = sanitized.replace(/^[.-]+|[.-]+$/g, "")

    return sanitized
}

export function escapeHtml(input: string): string {
    const htmlEntities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }
    return input.replace(/[&<>"']/g, (char) => htmlEntities[char] || char)
}
