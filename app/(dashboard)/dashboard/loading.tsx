import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-border/40 pb-6">
                <div className="space-y-1">
                    <Skeleton className="h-9 w-32 mb-2" />
                    <Skeleton className="h-5 w-64" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-5 w-12" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                </div>
                <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-5 w-12" />
                    </div>
                    <Skeleton className="h-2 w-full" />
                </div>
            </div>

            <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-xl">
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                        <Skeleton className="h-8 w-20" />
                    </div>
                ))}
            </div>
        </div>
    )
}
