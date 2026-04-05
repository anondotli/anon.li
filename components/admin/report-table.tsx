"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ChevronLeft, ChevronRight, ExternalLink, FileBox, Mail, Search } from "lucide-react"
import { formatDate, getReportStatusInfo, getReasonLabel } from "@/lib/admin/format"

interface Report {
    id: string
    serviceType: string
    resourceId: string
    reason: string
    description: string
    contactEmail: string | null
    decryptionKey: string | null
    reporterIp: string
    status: string
    priority?: string | null
    reviewNotes: string | null
    actionTaken: string | null
    createdAt: Date
    reviewedAt: Date | null
    reviewedBy: string | null
}

interface ReportTableProps {
    reports: Report[]
    total: number
    page: number
    totalPages: number
    status: string
    serviceType: string
    search?: string
}

function getPriorityBadge(priority?: string) {
    switch (priority) {
        case "urgent":
            return { className: "bg-red-500/10 text-red-500 border-red-500/20", label: "Urgent" }
        case "high":
            return { className: "bg-orange-500/10 text-orange-500 border-orange-500/20", label: "High" }
        case "low":
            return { className: "bg-gray-500/10 text-gray-500 border-gray-500/20", label: "Low" }
        default:
            return null
    }
}

export function ReportTable({ reports, total, page, totalPages, status, serviceType, search = "" }: ReportTableProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [searchInput, setSearchInput] = useState(search)

    const updateParams = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        if (value && value !== "all") {
            params.set(key, value)
        } else {
            params.delete(key)
        }
        if (key !== "page") {
            params.delete("page")
        }
        router.push(`/admin/reports?${params.toString()}`)
    }

    const openFileWithKey = (resourceId: string, decryptionKey: string) => {
        window.open(`/d/${resourceId}#${decryptionKey}`, '_blank')
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by resource ID or description..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                updateParams("search", searchInput)
                            }
                        }}
                        className="pl-9"
                    />
                </div>
                <Select value={status || "pending"} onValueChange={(v) => updateParams("status", v)}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={serviceType || "all"} onValueChange={(v) => updateParams("type", v)}>
                    <SelectTrigger className="w-32">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="drop">Drop</SelectItem>
                        <SelectItem value="alias">Alias</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="text-sm text-muted-foreground">
                Showing {reports.length} of {total} reports
            </div>

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Resource</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Reported</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {reports.map((report) => {
                            const statusInfo = getReportStatusInfo(report.status)
                            return (
                                <TableRow
                                    key={report.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onClick={() => router.push(`/admin/reports/${report.id}`)}
                                >
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {report.serviceType === "drop" ? (
                                                <FileBox className="h-4 w-4" />
                                            ) : (
                                                <Mail className="h-4 w-4" />
                                            )}
                                            <span className="capitalize">{report.serviceType}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {report.serviceType === "drop" ? (
                                            <Link
                                                href={`/admin/drops/${report.resourceId}`}
                                                className="font-mono text-sm hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {report.resourceId.slice(0, 12)}...
                                            </Link>
                                        ) : (
                                            <code className="text-sm">{report.resourceId}</code>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <Badge variant="outline">
                                                {getReasonLabel(report.reason)}
                                            </Badge>
                                            {(() => {
                                                const pb = getPriorityBadge(report.priority ?? undefined)
                                                return pb ? (
                                                    <Badge variant="outline" className={`text-xs ${pb.className}`}>
                                                        {pb.label}
                                                    </Badge>
                                                ) : null
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusInfo.variant} className={statusInfo.className}>
                                            {statusInfo.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm text-muted-foreground">
                                            {formatDate(report.createdAt)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {report.serviceType === "drop" && report.decryptionKey && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openFileWithKey(report.resourceId, report.decryptionKey!)
                                                }}
                                                title="Open file in new tab"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                        {reports.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No reports found
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => updateParams("page", String(page - 1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => updateParams("page", String(page + 1))}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

        </div>
    )
}
