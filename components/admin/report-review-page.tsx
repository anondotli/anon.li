"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
    FileBox,
    Mail,
    ClipboardList,
    Clock,
    CheckCircle,
    AlertTriangle,
    Loader2,
    ArrowLeft,
} from "lucide-react"
import { formatDateTime, formatRelativeTime, getReportStatusInfo, getReasonLabel } from "@/lib/admin/format"
import { updateReport } from "@/actions/admin"
import { toast } from "sonner"
import { getReasonBadgeClass, TAKEDOWN_SUGGESTIONS } from "./report-review/utils"
import { ContentAccessCard } from "./report-review/content-access-card"
import { DropDetailsCard } from "./report-review/drop-details-card"
import { AliasDetailsCard } from "./report-review/alias-details-card"
import { FormDetailsCard } from "./report-review/form-details-card"
import { OwnerCard } from "./report-review/owner-card"
import { ReportHistoryCard } from "./report-review/report-history-card"
import { ReviewActions } from "./report-review/review-actions"
import type { Report, ReportDetailsResponse } from "./report-review/types"

interface ReportReviewPageProps {
    data: ReportDetailsResponse
}

export function ReportReviewPage({ data }: ReportReviewPageProps) {
    const router = useRouter()
    const report = data.report as Report
    const drop = data.drop
    const alias = data.alias
    const form = data.form
    const previousReports = data.previousReports

    const [loading, setLoading] = useState(false)
    const [reviewNotes, setReviewNotes] = useState(report.reviewNotes || "")
    const [actionTaken, setActionTaken] = useState(report.actionTaken || "")
    const [takedownReason, setTakedownReason] = useState("")
    const [newStatus, setNewStatus] = useState(report.status === "pending" ? "reviewed" : report.status)

    const statusInfo = getReportStatusInfo(report.status)

    const handleActionChange = (value: string) => {
        setActionTaken(value)
        if (value === "takedown" && !takedownReason) {
            setTakedownReason(TAKEDOWN_SUGGESTIONS[report.reason] ?? TAKEDOWN_SUGGESTIONS.other ?? "")
        }
    }

    const handleReview = async () => {
        if (!newStatus) return

        setLoading(true)
        const result = await updateReport(report.id, {
            status: newStatus,
            notes: reviewNotes,
            actionTaken: actionTaken || null,
            takedownReason: actionTaken === "takedown" ? takedownReason : undefined,
        })

        if (result.success) {
            toast.success("Report updated successfully")
            router.push("/admin/reports")
            router.refresh()
        } else if (result.error) {
            toast.error(result.error)
        }
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/reports">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        Review Report
                        <span className="text-muted-foreground font-normal text-sm">
                            #{report.id.slice(0, 8)}
                        </span>
                    </h1>
                    <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                        {report.serviceType === "drop" ? (
                            <Badge variant="outline" className="gap-1">
                                <FileBox className="h-3 w-3" />
                                File
                            </Badge>
                        ) : report.serviceType === "form" ? (
                            <Badge variant="outline" className="gap-1">
                                <ClipboardList className="h-3 w-3" />
                                Form
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1">
                                <Mail className="h-3 w-3" />
                                Mail
                            </Badge>
                        )}
                        <Badge variant="outline" className={getReasonBadgeClass(report.reason)}>
                            {getReasonLabel(report.reason)}
                        </Badge>
                        <Badge variant={statusInfo.variant} className={statusInfo.className}>
                            {statusInfo.label}
                        </Badge>
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(report.createdAt)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Status Banners */}
            {report.serviceType === "drop" && drop?.takenDown && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    This content has already been taken down.
                </div>
            )}

            {report.serviceType === "drop" && !drop && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4" />
                    This drop no longer exists (deleted or expired).
                </div>
            )}

            {report.serviceType === "alias" && alias && !alias.active && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    This alias has already been deactivated.
                </div>
            )}

            {report.serviceType === "form" && form?.takenDown && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-700 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    This form has already been taken down.
                </div>
            )}

            {report.serviceType === "form" && !form && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4" />
                    This form no longer exists (deleted).
                </div>
            )}

            {/* Content Access */}
            <ContentAccessCard report={report} drop={drop} />

            {/* Resource Details */}
            {report.serviceType === "drop" && (
                <DropDetailsCard
                    resourceId={report.resourceId}
                    drop={drop}
                    loading={false}
                />
            )}

            {report.serviceType === "alias" && (
                <AliasDetailsCard alias={alias} loading={false} />
            )}

            {report.serviceType === "form" && (
                <FormDetailsCard
                    resourceId={report.resourceId}
                    form={form}
                    loading={false}
                />
            )}

            {/* Owner */}
            <OwnerCard
                user={
                    report.serviceType === "drop"
                        ? drop?.user
                        : report.serviceType === "alias"
                            ? alias?.user
                            : form?.user
                }
                loading={false}
                serviceType={report.serviceType}
            />

            {/* Report History */}
            {previousReports && <ReportHistoryCard previousReports={previousReports} />}

            {/* Reporter Description */}
            <div className="space-y-3">
                <Label className="text-sm font-medium">Reporter Description</Label>
                <p className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                    {report.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>Contact: {report.contactEmail || "Not provided"}</span>
                    <span>
                        IP: <code className="font-mono">{report.reporterIp.slice(0, 16)}...</code>
                    </span>
                </div>
            </div>

            {/* Previous Review Info */}
            {report.reviewedAt && (
                <div className="p-3 bg-muted/50 rounded-lg border text-sm">
                    <Label className="text-muted-foreground">Previous Review</Label>
                    <p className="mt-1">
                        Reviewed by <span className="font-mono">{report.reviewedBy}</span> on{" "}
                        {formatDateTime(report.reviewedAt)}
                    </p>
                </div>
            )}

            <Separator />

            {/* Review Actions */}
            <ReviewActions
                report={report}
                drop={drop}
                alias={alias}
                form={form}
                newStatus={newStatus}
                setNewStatus={setNewStatus}
                actionTaken={actionTaken}
                onActionChange={handleActionChange}
                takedownReason={takedownReason}
                setTakedownReason={setTakedownReason}
                reviewNotes={reviewNotes}
                setReviewNotes={setReviewNotes}
            />

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button variant="outline" asChild>
                    <Link href="/admin/reports">Cancel</Link>
                </Button>
                <Button onClick={handleReview} disabled={loading || !newStatus}>
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        "Save Review"
                    )}
                </Button>
            </div>
        </div>
    )
}