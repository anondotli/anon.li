import { Skeleton } from "@/components/ui/skeleton"

export default function BillingLoading() {
    return (
        <div className="space-y-10 max-w-5xl">
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-9 w-32 mb-2" />
                    <Skeleton className="h-5 w-64" />
                </div>

                <div className="rounded-3xl border border-border/40 shadow-sm overflow-hidden bg-secondary/10">
                    <div className="bg-secondary/30 p-8 pb-6 border-b border-border/40">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-48" />
                                <Skeleton className="h-4 w-44" />
                            </div>
                            <Skeleton className="h-10 w-full sm:w-44 rounded-full" />
                        </div>
                    </div>
                    <div className="p-8">
                        <div className="grid gap-6 md:grid-cols-3">
                            {[1, 2].map((i) => (
                                <div key={i} className="space-y-2">
                                    <Skeleton className="h-4 w-24" />
                                    <Skeleton className="h-7 w-32" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <Skeleton className="h-7 w-40" />
                <div className="flex items-center justify-between p-6 rounded-lg border bg-card">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-5 w-5 rounded" />
                </div>
            </div>
        </div>
    )
}
