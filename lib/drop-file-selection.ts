/**
 * Browser-only helpers for retaining folder paths while File objects travel
 * through the upload flow. File.webkitRelativePath is populated by directory
 * inputs but not consistently by drag-and-drop, so we attach an equivalent
 * non-enumerable path for entries discovered through the File System API.
 */

const RELATIVE_PATH_PROPERTY = "__anonLiRelativePath"

type FileWithRelativePath = File & {
    [RELATIVE_PATH_PROPERTY]?: string
}

function normalizeRelativePath(path: string, fallbackName: string): string {
    const parts = path
        .replace(/\\/g, "/")
        .split("/")
        .filter((part) => part.length > 0 && part !== ".")
        .map((part) => part === ".." ? "_" : part.replace(/\0/g, ""))
        .filter(Boolean)

    return parts.join("/") || fallbackName
}

function withRelativePath(file: File, path: string): File {
    const normalized = normalizeRelativePath(path, file.name)
    Object.defineProperty(file, RELATIVE_PATH_PROPERTY, {
        configurable: true,
        value: normalized,
    })
    return file
}

export function getUploadFilePath(file: File): string {
    const taggedPath = (file as FileWithRelativePath)[RELATIVE_PATH_PROPERTY]
    return normalizeRelativePath(taggedPath || file.webkitRelativePath || file.name, file.name)
}

export function prepareSelectedFiles(files: Iterable<File>): File[] {
    return Array.from(files, (file) => withRelativePath(
        file,
        file.webkitRelativePath || file.name,
    ))
}

async function readDirectoryEntries(
    entry: FileSystemDirectoryEntry,
    parentPath: string,
): Promise<File[]> {
    const files: File[] = []
    const reader = entry.createReader()

    const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => reader.readEntries(resolve, reject))

    let entries = await readBatch()
    while (entries.length > 0) {
        for (const child of entries) {
            const childPath = `${parentPath}${child.name}`
            if (child.isFile) {
                const file = await new Promise<File>((resolve, reject) =>
                    (child as FileSystemFileEntry).file(resolve, reject))
                files.push(withRelativePath(file, childPath))
            } else if (child.isDirectory) {
                files.push(...await readDirectoryEntries(
                    child as FileSystemDirectoryEntry,
                    `${childPath}/`,
                ))
            }
        }
        entries = await readBatch()
    }

    return files
}

/** Extract files and folders before the DataTransfer object becomes invalid. */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
    const entries: FileSystemEntry[] = []

    for (const item of Array.from(dataTransfer.items || [])) {
        const entry = item.webkitGetAsEntry?.()
        if (entry) entries.push(entry)
    }

    if (entries.length === 0) {
        return prepareSelectedFiles(dataTransfer.files)
    }

    const files: File[] = []
    for (const entry of entries) {
        if (entry.isDirectory) {
            files.push(...await readDirectoryEntries(
                entry as FileSystemDirectoryEntry,
                `${entry.name}/`,
            ))
        } else if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) =>
                (entry as FileSystemFileEntry).file(resolve, reject))
            files.push(withRelativePath(file, entry.name))
        }
    }

    return files.length > 0 ? files : prepareSelectedFiles(dataTransfer.files)
}
