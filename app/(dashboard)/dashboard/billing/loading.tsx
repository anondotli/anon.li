import { Skeleton } from "@/components/ui/skeleton"

export default function BillingLoading() {
    return (
        <div className="space-y-10 max-w-5xl">
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-9 w-32 mb-2" />
                    <Skeleton className="h-5 w-64" />
                </div>

                <div className="rounded-3xl border border-border/40 shadow-sm overflow-hidden h-64 bg-secondary/10">
                    <div className="p-8 pb-6 border-b border-border/40">
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-48" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                            <Skeleton className="h-10 w-40" />
                        </div>
                    </div>
                    <div className="p-8">
                        <Skeleton className="h-12 w-full" />
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <Skeleton className="h-7 w-48" />
                <div className="grid gap-6 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-96 rounded-xl border p-6 space-y-4">
                            <Skeleton className="h-8 w-24" />
                            <Skeleton className="h-12 w-32" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-40 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
