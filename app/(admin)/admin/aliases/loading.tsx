import { Skeleton } from "@/components/ui/skeleton"

export default function AliasesLoading() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-4">
                <Skeleton className="h-10 w-64" />
            </div>
            <Skeleton className="h-96 rounded-lg" />
        </div>
    )
}
