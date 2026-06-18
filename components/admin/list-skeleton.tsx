import { Skeleton } from "@/components/ui/skeleton"

/** Shared loading skeleton for admin list pages (header + toolbar + table). */
export function ListSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-4">
                <Skeleton className="h-10 flex-1 max-w-md" />
                <Skeleton className="h-10 w-40" />
            </div>
            <Skeleton className="h-96 w-full rounded-lg" />
        </div>
    )
}
