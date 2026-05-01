import { MetadataRoute } from "next"
import { getAllFilesFrontMatter, FrontMatter } from "@/lib/mdx"
import { comparisons } from "@/config/comparisons"

interface BlogPost extends FrontMatter {
    publishedAt?: string
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const blogs = await getAllFilesFrontMatter<BlogPost>("blog")
    const docs = await getAllFilesFrontMatter("docs")

    const blogEntries = blogs.map((post) => ({
        url: `https://anon.li/blog/${post.slug}`,
        lastModified: new Date(post.publishedAt || new Date()).toISOString(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
    }))

    const docEntries = docs.map((doc) => ({
        url: `https://anon.li/docs/${doc.slug}`,
        lastModified: new Date().toISOString(),
        changeFrequency: "monthly" as const,
        priority: 0.8,
    }))

    const comparisonEntries = comparisons.map((comparison) => ({
        url: `https://anon.li/compare/${comparison.slug}`,
        lastModified: new Date(comparison.lastVerified).toISOString(),
        changeFrequency: "monthly" as const,
        priority: 0.7,
    }))

    const routes = [
        { path: "", priority: 1.0, changeFrequency: "daily" as const },
        { path: "/alias", priority: 0.9, changeFrequency: "weekly" as const },
        { path: "/drop", priority: 0.9, changeFrequency: "weekly" as const },
        { path: "/form", priority: 0.9, changeFrequency: "weekly" as const },
        { path: "/mcp", priority: 0.8, changeFrequency: "weekly" as const },
        { path: "/pricing", priority: 0.8, changeFrequency: "weekly" as const },
        { path: "/drop/upload", priority: 0.7, changeFrequency: "weekly" as const },
        { path: "/about", priority: 0.7, changeFrequency: "monthly" as const },
        { path: "/security", priority: 0.7, changeFrequency: "monthly" as const },
        { path: "/faq", priority: 0.7, changeFrequency: "monthly" as const },
        { path: "/warrant-canary", priority: 0.6, changeFrequency: "monthly" as const },
        { path: "/compare", priority: 0.7, changeFrequency: "monthly" as const },
        { path: "/login", priority: 0.5, changeFrequency: "monthly" as const },
        { path: "/register", priority: 0.6, changeFrequency: "monthly" as const },
        { path: "/blog", priority: 0.7, changeFrequency: "weekly" as const },
        { path: "/docs", priority: 0.8, changeFrequency: "weekly" as const },
    ].map((route) => ({
        url: `https://anon.li${route.path}`,
        lastModified: new Date().toISOString(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
    }))

    return [...routes, ...comparisonEntries, ...blogEntries, ...docEntries]
}
