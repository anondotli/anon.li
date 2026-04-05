import { Calendar, User, Clock } from "lucide-react"

interface BlogHeaderProps {
    title: string
    publishedAt?: string
    author?: string
    readingTime?: string
    summary?: string
}

export function BlogHeader({
    title,
    publishedAt,
    author,
    readingTime,
    summary,
}: BlogHeaderProps) {
    return (
        <header className="mb-12 space-y-6">
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight leading-[1.1]">
                {title}
            </h1>

            {summary && (
                <p className="text-xl text-muted-foreground font-light leading-relaxed max-w-2xl">
                    {summary}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-2">
                {publishedAt && (
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <time dateTime={publishedAt}>
                            {new Date(publishedAt).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                            })}
                        </time>
                    </div>
                )}
                {author && (
                    <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{author}</span>
                    </div>
                )}
                {readingTime && (
                    <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>{readingTime}</span>
                    </div>
                )}
            </div>

            <div className="h-px bg-border/50 mt-6" />
        </header>
    )
}
