import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function DropLoading() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-border/40 pb-6">
                <div className="space-y-1">
                    <Skeleton className="h-9 w-24 mb-2" />
                    <Skeleton className="h-5 w-80" />
                </div>
            </div>

            {/* Create a Drop card */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-96" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-40 w-full rounded-lg" />
                </CardContent>
            </Card>

            {/* Your Drops card */}
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded" />
                                <div>
                                    <Skeleton className="h-5 w-40 mb-1" />
                                    <Skeleton className="h-4 w-24" />
                                </div>
                            </div>
                            <Skeleton className="h-8 w-20" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}
