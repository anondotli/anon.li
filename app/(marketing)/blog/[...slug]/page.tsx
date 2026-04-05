import { getFile, getFiles } from "@/lib/mdx"
import { MDXContent } from "@/components/shared/mdx-content"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { BlogHeader } from "@/components/marketing/blog"

export async function generateStaticParams() {
    const files = await getFiles("blog")
    return files.map((fileName) => ({
        slug: fileName.replace(".mdx", "").split("/"),
    }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const file = await getFile("blog", slug)
    if (!file) return {}
    return {
        title: `${file.metadata.title as string} - Anon.li Blog`,
        description: file.metadata.summary as string,
    }
}

function calculateReadingTime(content: string): string {
    const wordsPerMinute = 200
    const words = content.split(/\s+/).length
    const minutes = Math.ceil(words / wordsPerMinute)
    return `${minutes} min read`
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params
    const file = await getFile("blog", slug)

    if (!file) {
        notFound()
    }

    const readingTime = calculateReadingTime(file.content)

    return (
        <div className="min-h-screen">
            {/* Back link header */}
            <div className="border-b border-border/40 bg-secondary/20">
                <div className="container mx-auto px-6 md:px-8 max-w-3xl py-4">
                    <Link
                        href="/blog"
                        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors group"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-1" />
                        Back to Blog
                    </Link>
                </div>
            </div>

            {/* Article */}
            <article className="container mx-auto px-6 md:px-8 max-w-3xl py-12 md:py-16">
                <BlogHeader
                    title={file.metadata.title as string}
                    publishedAt={file.metadata.publishedAt as string}
                    author={file.metadata.author as string}
                    readingTime={readingTime}
                    summary={file.metadata.summary as string}
                />

                <div className="prose prose-lg dark:prose-invert prose-headings:font-serif prose-headings:font-medium prose-p:font-light prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none max-w-none">
                    <MDXContent source={file.content} />
                </div>

                {/* Article footer */}
                <footer className="mt-16 pt-8 border-t border-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="text-sm text-muted-foreground">
                            Published on{" "}
                            {new Date(file.metadata.publishedAt as string).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                            })}
                        </div>
                        <Link
                            href="/blog"
                            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                        >
                            ← More articles
                        </Link>
                    </div>
                </footer>
            </article>
        </div>
    )
}
