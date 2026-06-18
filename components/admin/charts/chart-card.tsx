import { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface ChartCardProps {
    title: string
    description?: string
    /** Right-aligned controls (e.g. a range toggle). */
    action?: ReactNode
    children: ReactNode
    className?: string
}

/** Card shell for an analytics chart: title/description on the left, controls on the right. */
export function ChartCard({ title, description, action, children, className }: ChartCardProps) {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                    <CardTitle className="text-base">{title}</CardTitle>
                    {description && <CardDescription>{description}</CardDescription>}
                </div>
                {action}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    )
}
