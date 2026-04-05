import { getAllFilesFrontMatter, FrontMatter } from "@/lib/mdx"
import { BlogCard } from "@/components/marketing/blog"
import { Newspaper } from "lucide-react"

export const metadata = {
    title: "Blog - Anon.li",
    description: "Latest news, updates, and insights from the Anon.li team.",
}

interface BlogPost extends FrontMatter {
    title: string
    summary?: string
    publishedAt?: string
    author?: string
}

export default async function BlogPage() {
    const posts = await getAllFilesFrontMatter<BlogPost>("blog")

    // Sort posts by date (newest first)
    const sortedPosts = posts.sort((a, b) => {
        if (!a.publishedAt || !b.publishedAt) return 0
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    })

    const featuredPost = sortedPosts[0]
    const otherPosts = sortedPosts.slice(1)

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative py-20 md:py-28 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-secondary/30 to-transparent" />
                <div className="container mx-auto px-6 md:px-8 max-w-5xl relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-primary/10">
                            <Newspaper className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Blog
                        </span>
                    </div>

                    <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6">
                        News & Updates
                    </h1>

                    <p className="text-xl text-muted-foreground font-light max-w-2xl leading-relaxed">
                        Product announcements, privacy insights, and tips to keep your digital identity secure.
                    </p>
                </div>
            </section>

            {/* Posts Grid */}
            <section className="container mx-auto px-6 md:px-8 max-w-5xl pb-24">
                {sortedPosts.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-muted-foreground text-lg">No posts yet. Check back soon!</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Featured Post */}
                        {featuredPost && (
                            <div className="mb-12">
                                <BlogCard
                                    title={featuredPost.title}
                                    summary={featuredPost.summary}
                                    slug={featuredPost.slug}
                                    publishedAt={featuredPost.publishedAt}
                                    author={featuredPost.author}
                                    featured
                                />
                            </div>
                        )}

                        {/* Other Posts */}
                        {otherPosts.length > 0 && (
                            <div className="grid gap-6 sm:grid-cols-2">
                                {otherPosts.map((post) => (
                                    <BlogCard
                                        key={post.slug}
                                        title={post.title}
                                        summary={post.summary}
                                        slug={post.slug}
                                        publishedAt={post.publishedAt}
                                        author={post.author}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    )
}
