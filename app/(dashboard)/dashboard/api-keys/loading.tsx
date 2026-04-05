import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function ApiKeysLoading() {
    return (
        <div className="space-y-8">
            <div className="border-b border-border/40 pb-6">
                <Skeleton className="h-9 w-36 mb-2" />
                <Skeleton className="h-5 w-72" />
            </div>

            <div className="grid gap-8">
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </CardHeader>
                    <CardContent className="p-6 pt-0">
                        <Skeleton className="h-2 w-full" />
                    </CardContent>
                </Card>

                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-8 pb-4">
                        <Skeleton className="h-6 w-36" />
                        <Skeleton className="h-4 w-80" />
                    </CardHeader>
                    <CardContent className="grid gap-6 p-8 pt-4">
                        <Skeleton className="h-10 w-full" />
                        <div className="mt-4 space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="space-y-1">
                                        <Skeleton className="h-5 w-40" />
                                        <Skeleton className="h-4 w-56" />
                                    </div>
                                    <Skeleton className="h-8 w-20" />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
