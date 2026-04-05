import fs from "fs"
import path from "path"
import matter from "gray-matter"


const root = process.cwd()

interface MdxFile {
    slug: string
    metadata: Record<string, unknown>
    content: string
}

async function getFilesRecursively(dir: string): Promise<string[]> {
    try {
        await fs.promises.access(dir)
    } catch {
        return []
    }

    const list = await fs.promises.readdir(dir)

    const filesArrays = await Promise.all(list.map(async (file) => {
        const filePath = path.join(dir, file)
        const stat = await fs.promises.stat(filePath)

        if (stat.isDirectory()) {
            return getFilesRecursively(filePath)
        } else {
            if (path.extname(file) === ".mdx") {
                return [filePath]
            }
            return []
        }
    }))

    return filesArrays.flat()
}

export async function getFiles(type: string) {
    const contentDir = path.join(root, "content", type)
    const files = await getFilesRecursively(contentDir)
    return files.map(file => path.relative(contentDir, file))
}

export async function getFile(type: string, slug: string | string[]): Promise<MdxFile | undefined> {
    const slugString = Array.isArray(slug) ? slug.join("/") : slug
    let filePath = path.join(root, "content", type, `${slugString}.mdx`)

    // Check for direct file first, then index.mdx in directory
    try {
        await fs.promises.access(filePath)
    } catch {
        const indexPath = path.join(root, "content", type, slugString, "index.mdx")
        try {
            await fs.promises.access(indexPath)
            filePath = indexPath
        } catch {
            return undefined
        }
    }

    const source = await fs.promises.readFile(filePath, "utf8")
    const { data, content } = matter(source)

    return {
        slug: slugString,
        metadata: data,
        content,
    }
}

export interface FrontMatter {
    slug: string
    [key: string]: unknown
}

export async function getAllFilesFrontMatter<T extends FrontMatter = FrontMatter>(type: string): Promise<T[]> {
    const files = await getFiles(type)

    const posts = await Promise.all(files.map(async (relativePath) => {
        const slug = relativePath.replace(".mdx", "")
        const source = await fs.promises.readFile(
            path.join(root, "content", type, relativePath),
            "utf8"
        )
        const { data } = matter(source)

        return {
            slug,
            ...data,
        } as T
    }))

    // Original implementation reversed the order using reduce: [newItem, ...allPosts]
    return posts.reverse()
}
