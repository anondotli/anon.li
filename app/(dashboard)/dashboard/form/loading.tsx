import { Skeleton } from "@/components/ui/skeleton"

export default function FormListLoading() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-5 w-72" />
                </div>
                <Skeleton className="h-10 w-28" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-[5.5rem] w-full rounded-xl" />
                <Skeleton className="h-[5.5rem] w-full rounded-xl" />
            </div>

            <div className="space-y-4">
                <Skeleton className="h-[4.5rem] w-full rounded-lg" />
                <div className="overflow-hidden rounded-xl border border-border/60 luxury-shadow-sm">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-4 last:border-0"
                        >
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-64" />
                            </div>
                            <Skeleton className="h-8 w-16" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
