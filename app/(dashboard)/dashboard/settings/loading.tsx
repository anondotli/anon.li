import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function SettingsLoading() {
    return (
        <div className="space-y-8">
            <div>
                <Skeleton className="h-9 w-32 mb-2" />
                <Skeleton className="h-5 w-64" />
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-4 w-48" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-56" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Skeleton className="h-5 w-40" />
                                <Skeleton className="h-4 w-64 mt-1" />
                            </div>
                            <Skeleton className="h-6 w-10" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-destructive/50">
                    <CardHeader>
                        <Skeleton className="h-6 w-28" />
                        <Skeleton className="h-4 w-72" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-10 w-36" />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
