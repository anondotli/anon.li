"use client"

import { useEffect, useState, useMemo } from "react"
import { cn } from "@/lib/utils"

interface TocItem {
    id: string
    text: string
    level: number
}

interface DocsTableOfContentsProps {
    content: string
}

export function DocsTableOfContents({ content }: DocsTableOfContentsProps) {
    const [activeId, setActiveId] = useState<string>("")

    // Extract headings from markdown content using useMemo for pure transformation
    const headings = useMemo(() => {
        const headingRegex = /^(#{2,3})\s+(.+)$/gm
        const matches: TocItem[] = []
        const idCounts = new Map<string, number>()
        let match

        while ((match = headingRegex.exec(content)) !== null) {
            const headingMatch = match[1];
            const textMatch = match[2];

            if (headingMatch && textMatch) {
                const level = headingMatch.length
                const text = textMatch.trim()
                let id = text
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, "")
                    .replace(/\s+/g, "-")

                const count = idCounts.get(id) ?? 0
                idCounts.set(id, count + 1)
                if (count > 0) id = `${id}-${count}`

                matches.push({ id, text, level })
            }
        }

        return matches
    }, [content])

    useEffect(() => {
        if (headings.length === 0) return

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id)
                    }
                })
            },
            { rootMargin: "-80px 0% -80% 0%" }
        )

        headings.forEach(({ id }) => {
            const element = document.getElementById(id)
            if (element) observer.observe(element)
        })

        return () => observer.disconnect()
    }, [headings])

    if (headings.length === 0) {
        return null
    }

    return (
        <div className="hidden xl:block w-56 shrink-0">
            <div className="sticky top-24 pl-8 border-l border-border/40">
                <h4 className="font-medium text-sm uppercase tracking-wider text-muted-foreground mb-4">
                    On this page
                </h4>
                <nav className="space-y-1">
                    {headings.map((heading) => (
                        <a
                            key={heading.id}
                            href={`#${heading.id}`}
                            className={cn(
                                "block text-sm py-1 transition-colors duration-200",
                                heading.level === 3 && "pl-4",
                                activeId === heading.id
                                    ? "text-primary font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {heading.text}
                        </a>
                    ))}
                </nav>
            </div>
        </div>
    )
}
