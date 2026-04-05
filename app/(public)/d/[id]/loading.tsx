import { Skeleton } from "@/components/ui/skeleton"

export default function DropDownloadLoading() {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-md space-y-6 p-6">
                <div className="text-center space-y-2">
                    <Skeleton className="h-8 w-48 mx-auto" />
                    <Skeleton className="h-4 w-64 mx-auto" />
                </div>
                <div className="space-y-3">
                    {[1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1">
                                <Skeleton className="h-5 w-40" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                            <Skeleton className="h-8 w-8" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-12 w-full rounded-full" />
            </div>
        </div>
    )
}
