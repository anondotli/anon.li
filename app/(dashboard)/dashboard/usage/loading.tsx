import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

function UsageCardSkeleton() {
    return (
        <Card className="rounded-3xl border-border/40 shadow-sm">
            <CardHeader className="p-6 pb-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10">
                        <Skeleton className="h-5 w-5 rounded" />
                    </div>
                    <div>
                        <Skeleton className="h-5 w-32 mb-1" />
                        <Skeleton className="h-4 w-44" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-3">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-full" />
            </CardContent>
        </Card>
    )
}

export default function UsageLoading() {
    return (
        <div className="space-y-8">
            <div className="border-b border-border/40 pb-6">
                <Skeleton className="h-9 w-28 mb-2" />
                <Skeleton className="h-5 w-72" />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                    <UsageCardSkeleton key={i} />
                ))}

                {/* API Usage card skeleton */}
                <UsageCardSkeleton />

                {/* Upgrade card skeleton */}
                <Card className="rounded-3xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/20">
                                <Skeleton className="h-5 w-5 rounded" />
                            </div>
                            <div>
                                <Skeleton className="h-5 w-32 mb-1" />
                                <Skeleton className="h-4 w-48" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-10 w-full rounded-full" />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
