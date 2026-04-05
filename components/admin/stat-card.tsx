import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LucideIcon } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface StatCardProps {
    title: string
    value: string | number
    description?: string
    icon: LucideIcon
    href?: string
    variant?: "default" | "destructive"
}

export function StatCard({ title, value, description, icon: Icon, href, variant = "default" }: StatCardProps) {
    const content = (
        <Card className={cn(
            href && "hover:bg-muted/50 transition-colors cursor-pointer",
            variant === "destructive" && "border-destructive/50 bg-destructive/5 hover:bg-destructive/10"
        )}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className={cn(
                    "text-sm font-medium",
                    variant === "destructive" && "text-destructive"
                )}>
                    {title}
                </CardTitle>
                <Icon className={cn(
                    "h-4 w-4",
                    variant === "destructive" ? "text-destructive" : "text-muted-foreground"
                )} />
            </CardHeader>
            <CardContent>
                <div className={cn(
                    "text-2xl font-bold",
                    variant === "destructive" && "text-destructive"
                )}>
                    {value}
                </div>
                {description && (
                    <p className={cn(
                        "text-xs",
                        variant === "destructive" ? "text-destructive/80" : "text-muted-foreground"
                    )}>
                        {description}
                    </p>
                )}
            </CardContent>
        </Card>
    )

    if (href) {
        return <Link href={href}>{content}</Link>
    }

    return content
}
