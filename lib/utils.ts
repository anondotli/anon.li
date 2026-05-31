import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
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
