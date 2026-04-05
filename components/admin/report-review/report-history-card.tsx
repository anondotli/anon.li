"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { History } from "lucide-react"
import { formatRelativeTime, getReportStatusInfo, getReasonLabel } from "@/lib/admin/format"
import type { PreviousReport } from "./types"

interface ReportHistoryCardProps {
    previousReports: {
        count: number
        recent: PreviousReport[]
    }
}

export function ReportHistoryCard({ previousReports }: ReportHistoryCardProps) {
    if (previousReports.count === 0) return null

    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Report History
                        <Badge variant="secondary">{previousReports.count} other</Badge>
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="space-y-2">
                    {previousReports.recent.map((prev) => {
                        const prevStatus = getReportStatusInfo(prev.status)
                        return (
                            <div key={prev.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                        {getReasonLabel(prev.reason)}
                                    </Badge>
                                    <Badge variant={prevStatus.variant} className={`text-xs ${prevStatus.className || ''}`}>
                                        {prevStatus.label}
                                    </Badge>
                                    {prev.actionTaken && prev.actionTaken !== "none" && (
                                        <span className="text-xs text-muted-foreground">
                                            ({prev.actionTaken})
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {formatRelativeTime(prev.createdAt)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
