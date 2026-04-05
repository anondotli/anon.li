import { getAllFilesFrontMatter, FrontMatter } from "@/lib/mdx"
import { DocsCard } from "@/components/marketing/docs"
import { docsConfig, getDocsContentSlugCandidatesFromHref } from "@/config/docs"
import { BookOpen, Code2, Scale, Rocket, Terminal } from "lucide-react"
import Link from "next/link"

export const metadata = {
    title: "Documentation - Anon.li",
    description: "Learn how to use Anon.li's privacy tools and API.",
}

interface DocPost extends FrontMatter {
    title: string
    summary?: string
}

// Map section titles to icons
const sectionIcons: Record<string, typeof BookOpen> = {
    "Getting Started": Rocket,
    "CLI": Terminal,
    "API": Code2,
    "Legal": Scale,
}

export default async function DocsPage() {
    const docs = await getAllFilesFrontMatter<DocPost>("docs")

    // Create a map of slug to doc for quick lookup
    const docsMap = new Map(docs.map(doc => [doc.slug, doc]))

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative py-20 md:py-28 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-secondary/30 to-transparent" />
                <div className="container mx-auto px-6 md:px-8 max-w-5xl relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-xl bg-primary/10">
                            <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            Documentation
                        </span>
                    </div>

                    <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6">
                        Learn Anon.li
                    </h1>

                    <p className="text-xl text-muted-foreground font-light max-w-2xl leading-relaxed">
                        Everything you need to get started with anonymous email aliases and encrypted file sharing.
                    </p>
                </div>
            </section>

            {/* Docs Grid by Section */}
            <section className="container mx-auto px-6 md:px-8 max-w-5xl pb-24">
                <div className="space-y-16">
                    {docsConfig.sidebarNav.map((section) => {
                        const SectionIcon = sectionIcons[section.title] || BookOpen

                        return (
                            <div key={section.title}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 rounded-lg bg-secondary/60">
                                        <SectionIcon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <h2 className="font-serif text-2xl font-medium">
                                        {section.title}
                                    </h2>
                                </div>

                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {section.items.map((item) => {
                                        const doc = getDocsContentSlugCandidatesFromHref(item.href)
                                            .map((slug) => docsMap.get(slug))
                                            .find(Boolean)

                                        return (
                                            <DocsCard
                                                key={item.href}
                                                title={item.title}
                                                description={doc?.summary}
                                                href={item.href}
                                                icon={SectionIcon}
                                            />
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Quick Links */}
                <div className="mt-20 pt-12 border-t border-border/40">
                    <h3 className="font-serif text-lg font-medium mb-6 text-muted-foreground">
                        Popular Resources
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Link
                            href="/docs/getting-started"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            → Quick start guide
                        </Link>
                        <Link
                            href="/docs/api"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            → API reference
                        </Link>
                        <Link
                            href="/privacy"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            → Privacy policy
                        </Link>
                        <Link
                            href="/faq"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            → FAQ
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    )
}
