function sanitizePathSegment(segment: string): string {
    return segment
        .replace(/\0/g, "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/^\.+$/, "_")
        .slice(0, 200) || "unnamed_file"
}

export function sanitizeDownloadFilename(path: string): string {
    const finalSegment = path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path
    return sanitizePathSegment(finalSegment)
}

export function sanitizeArchivePath(path: string): string {
    const segments = path
        .replace(/\\/g, "/")
        .split("/")
        .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
        .map(sanitizePathSegment)

    return segments.join("/") || "unnamed_file"
}

/** Avoid silently overwriting same-named files in the in-memory ZIP map. */
export function uniqueArchivePath(path: string, usedPaths: Set<string>): string {
    if (!usedPaths.has(path)) {
        usedPaths.add(path)
        return path
    }

    const slashIndex = path.lastIndexOf("/")
    const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : ""
    const filename = slashIndex >= 0 ? path.slice(slashIndex + 1) : path
    const dotIndex = filename.lastIndexOf(".")
    const hasExtension = dotIndex > 0
    const stem = hasExtension ? filename.slice(0, dotIndex) : filename
    const extension = hasExtension ? filename.slice(dotIndex) : ""

    let suffix = 2
    let candidate = ""
    do {
        candidate = `${directory}${stem} (${suffix})${extension}`
        suffix++
    } while (usedPaths.has(candidate))

    usedPaths.add(candidate)
    return candidate
}
