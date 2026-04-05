import { Skeleton } from "@/components/ui/skeleton"

export default function DomainsLoading() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-border/40 pb-6">
                <div className="space-y-1">
                    <Skeleton className="h-9 w-40 mb-2" />
                    <Skeleton className="h-5 w-56" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            <div className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2 w-full" />
            </div>

            <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-6 w-16" />
                            <Skeleton className="h-8 w-8" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
