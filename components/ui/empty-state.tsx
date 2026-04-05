import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface EmptyStateProps {
    icon: LucideIcon
    title: string
    description?: string
    action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-secondary/50 p-4 mb-4">
                <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium font-serif mb-2">{title}</h3>
            {description && (
                <p className="text-muted-foreground text-sm max-w-sm mb-6">{description}</p>
            )}
            {action}
        </div>
    )
}
