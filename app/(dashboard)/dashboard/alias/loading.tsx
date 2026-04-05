import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function AliasLoading() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <Skeleton className="h-9 w-48 mb-2" />
                    <Skeleton className="h-5 w-64" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <Skeleton className="h-5 w-24" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-2 w-full mt-2" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <Skeleton className="h-5 w-20" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-2 w-full mt-2" />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-9 w-32" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1">
                                <Skeleton className="h-5 w-56" />
                                <Skeleton className="h-4 w-40" />
                            </div>
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-6 w-12" />
                                <Skeleton className="h-8 w-8" />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}
