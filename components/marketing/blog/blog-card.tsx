"use client"

import Link from "next/link"
import { ArrowRight, Calendar, User, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface BlogCardProps {
    title: string
    summary?: string
    slug: string
    publishedAt?: string
    author?: string
    readingTime?: string
    featured?: boolean
}

export function BlogCard({
    title,
    summary,
    slug,
    publishedAt,
    author,
    readingTime,
    featured = false,
}: BlogCardProps) {
    return (
        <Link
            href={`/blog/${slug}`}
            className={cn(
                "group relative flex flex-col rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/60 hover:bg-secondary/30 hover:shadow-lg",
                featured ? "p-8 md:p-10" : "p-6 md:p-8"
            )}
        >
            {/* Hover gradient effect */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="relative z-10 flex flex-col h-full">
                {/* Title */}
                <h2
                    className={cn(
                        "font-serif font-medium tracking-tight transition-colors group-hover:text-primary",
                        featured ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
                    )}
                >
                    {title}
                </h2>

                {/* Summary */}
                {summary && (
                    <p
                        className={cn(
                            "mt-3 text-muted-foreground font-light leading-relaxed",
                            featured ? "text-base line-clamp-3" : "text-sm line-clamp-2"
                        )}
                    >
                        {summary}
                    </p>
                )}

                {/* Meta info */}
                <div className="mt-auto pt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    {publishedAt && (
                        <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <time dateTime={publishedAt}>
                                {new Date(publishedAt).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </time>
                        </div>
                    )}
                    {author && (
                        <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            <span>{author}</span>
                        </div>
                    )}
                    {readingTime && (
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{readingTime}</span>
                        </div>
                    )}

                    {/* Arrow indicator */}
                    <div className="ml-auto flex items-center gap-1 text-primary opacity-0 transition-all duration-300 group-hover:opacity-100">
                        <span className="text-xs font-medium">Read more</span>
                        <ArrowRight className="h-3.5 w-3.5 -translate-x-1 transition-transform group-hover:translate-x-0" />
                    </div>
                </div>
            </div>
        </Link>
    )
}
