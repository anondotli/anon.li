import { Skeleton } from "@/components/ui/skeleton"

export default function OrganizationsLoading() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
            </div>
            <Skeleton className="h-96 rounded-lg" />
        </div>
    )
}
