import { getFile, getFiles } from "@/lib/mdx"
import { MDXContent } from "@/components/shared/mdx-content"
import { notFound } from "next/navigation"
import { docsConfig } from "@/config/docs"
import { DocsSidebar, DocsTableOfContents, DocsPagination, DocsBreadcrumb } from "@/components/marketing/docs"

export async function generateStaticParams() {
    const files = await getFiles("docs")
    return files.map((fileName) => ({
        slug: fileName.replace(".mdx", "").split("/"),
    }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const file = await getFile("docs", slug)
    if (!file) return {}
    return {
        title: `${file.metadata.title as string} - Anon.li Docs`,
        description: file.metadata.summary as string,
    }
}

// Get all docs in flat array for prev/next navigation
function getFlatDocs() {
    const flatDocs: { title: string; href: string }[] = []
    for (const section of docsConfig.sidebarNav) {
        for (const item of section.items) {
            flatDocs.push({ title: item.title, href: item.href })
        }
    }
    return flatDocs
}

// Build breadcrumb items from slug
function getBreadcrumbs(slug: string[], title: string) {
    const items: { title: string; href?: string }[] = []

    if (slug.length > 1) {
        // Add parent section (e.g., "api" for "api/alias")
        const parentSlug = slug.slice(0, -1).join("/")
        const parentSection = docsConfig.sidebarNav.find(s =>
            s.items.some(i => i.href === `/docs/${parentSlug}`)
        )
        if (parentSection) {
            items.push({ title: parentSection.title, href: `/docs/${parentSlug}` })
        }
    }

    items.push({ title })
    return items
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const file = await getFile("docs", slug)

    if (!file) {
        notFound()
    }

    const currentPath = `/docs/${slug.join("/")}`
    const flatDocs = getFlatDocs()
    const currentIndex = flatDocs.findIndex(d => d.href === currentPath)
    const prev = currentIndex > 0 ? flatDocs[currentIndex - 1] : undefined
    const next = currentIndex < flatDocs.length - 1 ? flatDocs[currentIndex + 1] : undefined
    const breadcrumbs = getBreadcrumbs(slug, file.metadata.title as string)

    return (
        <div className="min-h-screen">
            <div className="container mx-auto px-6 md:px-8 max-w-7xl py-12 md:py-16">
                <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
                    {/* Sidebar */}
                    <DocsSidebar
                        sections={docsConfig.sidebarNav}
                        currentPath={currentPath}
                    />

                    {/* Main Content */}
                    <main className="flex-1 min-w-0">
                        <article>
                            {/* Breadcrumb */}
                            <DocsBreadcrumb items={breadcrumbs} />

                            {/* Header */}
                            <header className="mb-10 pb-8 border-b border-border/40">
                                <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight mb-4">
                                    {file.metadata.title as string}
                                </h1>
                                {(file.metadata.summary as string) && (
                                    <p className="text-lg text-muted-foreground font-light leading-relaxed max-w-2xl">
                                        {file.metadata.summary as string}
                                    </p>
                                )}
                                {(file.metadata.lastUpdated as string) && (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Last updated {(file.metadata.lastUpdated as string)}
                                    </p>
                                )}
                            </header>

                            {/* Content */}
                            <div className="prose prose-lg dark:prose-invert prose-headings:font-serif prose-headings:font-medium prose-headings:scroll-mt-24 prose-p:font-light prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none max-w-none">
                                <MDXContent source={file.content} />
                            </div>

                            {/* Pagination */}
                            <DocsPagination prev={prev} next={next} />
                        </article>
                    </main>

                    {/* Table of Contents */}
                    <DocsTableOfContents content={file.content} />
                </div>
            </div>
        </div>
    )
}
