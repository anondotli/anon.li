import { Skeleton } from "@/components/ui/skeleton"

export default function FormResponsesLoading() {
    return (
        <div className="mx-auto w-full max-w-6xl space-y-8 pb-20">
            <div className="space-y-6">
                <Skeleton className="h-8 w-24" />

                <div className="space-y-4 border-b border-border/40 pb-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-2">
                            <Skeleton className="h-9 w-64" />
                            <Skeleton className="h-4 w-40" />
                        </div>
                        <div className="flex gap-2">
                            <Skeleton className="h-9 w-20" />
                            <Skeleton className="h-9 w-28" />
                            <Skeleton className="h-9 w-9" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-border/40 overflow-hidden rounded-xl border border-border/60 luxury-shadow-sm">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-8 w-12" />
                        </div>
                    ))}
                </div>
            </div>

            <Skeleton className="h-36 w-full rounded-xl" />

            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-9 w-48" />
                    <Skeleton className="h-9 w-28" />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-9 w-full max-w-xs" />
                    <Skeleton className="h-9 w-56" />
                </div>
                <Skeleton className="h-80 w-full rounded-xl" />
            </div>
        </div>
    )
}
