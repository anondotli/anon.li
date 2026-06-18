import { Skeleton } from "@/components/ui/skeleton"

export default function FormEditLoading() {
    return (
        <div className="mx-auto w-full max-w-[1600px]">
            <div className="flex items-center justify-between gap-3 px-4 pb-4 sm:px-6">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-9 w-28" />
            </div>

            <div className="grid gap-0 px-4 pb-24 sm:px-6 lg:gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="mx-auto w-full min-w-0 max-w-3xl space-y-8">
                    <Skeleton className="h-9 w-44" />
                    <div className="space-y-3 border-b border-border/40 pb-8">
                        <Skeleton className="h-12 w-3/4" />
                        <Skeleton className="h-5 w-1/2" />
                    </div>
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="mx-auto mt-8 w-full max-w-3xl xl:mx-0 xl:mt-0 xl:max-w-none">
                    <Skeleton className="h-96 w-full rounded-xl" />
                </div>
            </div>
        </div>
    )
}
