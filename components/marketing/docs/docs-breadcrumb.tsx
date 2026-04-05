import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"

interface DocsBreadcrumbProps {
    items: {
        title: string
        href?: string
    }[]
}

export function DocsBreadcrumb({ items }: DocsBreadcrumbProps) {
    return (
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
            <Link
                href="/docs"
                className="flex items-center hover:text-foreground transition-colors"
            >
                <Home className="h-3.5 w-3.5" />
            </Link>

            {items.map((item, index) => (
                <span key={index} className="flex items-center gap-1.5">
                    <ChevronRight className="h-3.5 w-3.5" />
                    {item.href ? (
                        <Link
                            href={item.href}
                            className="hover:text-foreground transition-colors"
                        >
                            {item.title}
                        </Link>
                    ) : (
                        <span className="text-foreground font-medium">{item.title}</span>
                    )}
                </span>
            ))}
        </nav>
    )
}
