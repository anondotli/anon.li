import { Skeleton } from "@/components/ui/skeleton"

export default function AnalyticsLoading() {
    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-48" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
            </div>
            <Skeleton className="h-[340px] w-full rounded-xl" />
            <div className="grid gap-6 lg:grid-cols-2">
                <Skeleton className="h-[300px] w-full rounded-xl" />
                <Skeleton className="h-[300px] w-full rounded-xl" />
            </div>
        </div>
    )
}
