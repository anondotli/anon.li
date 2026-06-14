import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"

export default function TeamAuditLoading() {
    return (
        <div className="flex flex-col gap-8">
            <div className="space-y-2 border-b border-border/40 pb-6">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-5 w-80" />
            </div>
            <Card className="divide-y divide-border/60">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-4 p-4">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                ))}
            </Card>
        </div>
    )
}
