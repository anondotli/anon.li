"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { DocHeading } from "@/lib/heading-slug"

interface DocsTableOfContentsProps {
    /** From extractHeadings() — same slugger as the rendered heading ids. */
    headings: DocHeading[]
}

export function DocsTableOfContents({ headings }: DocsTableOfContentsProps) {
    const [activeId, setActiveId] = useState<string>("")

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
