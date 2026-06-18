import { ReactNode } from "react"
import { Breadcrumb, type Crumb } from "./breadcrumb"

interface PageHeaderProps {
    title: string
    description?: string
    actions?: ReactNode
    /** Small uppercase label rendered above the title. */
    eyebrow?: string
    /** Breadcrumb trail rendered above the title (takes precedence over eyebrow). */
    breadcrumbs?: Crumb[]
}

export function PageHeader({ title, description, actions, eyebrow, breadcrumbs }: PageHeaderProps) {
    return (
        <div className="space-y-3">
            {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                    {!breadcrumbs && eyebrow && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                            {eyebrow}
                        </p>
                    )}
                    <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                    {description && (
                        <p className="text-muted-foreground">{description}</p>
                    )}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </div>
    )
}
