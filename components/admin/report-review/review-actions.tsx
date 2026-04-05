"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { AlertTriangle } from "lucide-react"
import { ACTION_DESCRIPTIONS } from "./utils"
import type { Report, DropDetails, AliasDetails } from "./types"

interface ReviewActionsProps {
    report: Report
    drop?: DropDetails | null
    alias?: AliasDetails | null
    newStatus: string
    setNewStatus: (v: string) => void
    actionTaken: string
    onActionChange: (v: string) => void
    takedownReason: string
    setTakedownReason: (v: string) => void
    reviewNotes: string
    setReviewNotes: (v: string) => void
}

export function ReviewActions({
    report,
    drop,
    alias,
    newStatus,
    setNewStatus,
    actionTaken,
    onActionChange,
    takedownReason,
    setTakedownReason,
    reviewNotes,
    setReviewNotes,
}: ReviewActionsProps) {
    const hasUser = report.serviceType === "drop" ? !!drop?.user : !!alias?.user
    const isDropTakenDown = report.serviceType === "drop" && drop?.takenDown
    const isAliasTakenDown = report.serviceType === "alias" && alias && !alias.active

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="reviewed">
                                <div>
                                    <div>Reviewed</div>
                                    <div className="text-xs text-muted-foreground">Examined, may need follow-up</div>
                                </div>
                            </SelectItem>
                            <SelectItem value="resolved">
                                <div>
                                    <div>Resolved</div>
                                    <div className="text-xs text-muted-foreground">Action taken, case closed</div>
                                </div>
                            </SelectItem>
                            <SelectItem value="dismissed">
                                <div>
                                    <div>Dismissed</div>
                                    <div className="text-xs text-muted-foreground">No violation found</div>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="action">Action Taken</Label>
                    <Select value={actionTaken} onValueChange={onActionChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select action (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">
                                <div>
                                    <div>No action</div>
                                    <div className="text-xs text-muted-foreground">{ACTION_DESCRIPTIONS.none}</div>
                                </div>
                            </SelectItem>
                            <SelectItem value="warning" disabled={!hasUser}>
                                <div>
                                    <div>Warning issued</div>
                                    <div className="text-xs text-muted-foreground">
                                        {!hasUser ? "Not available — no user associated" : ACTION_DESCRIPTIONS.warning}
                                    </div>
                                </div>
                            </SelectItem>
                            <SelectItem
                                value="takedown"
                                disabled={!!isDropTakenDown || !!isAliasTakenDown}
                            >
                                <div>
                                    <div>Content taken down</div>
                                    <div className="text-xs text-muted-foreground">
                                        {isDropTakenDown || isAliasTakenDown
                                            ? "Already taken down"
                                            : ACTION_DESCRIPTIONS.takedown}
                                    </div>
                                </div>
                            </SelectItem>
                            <SelectItem value="ban" disabled={!hasUser}>
                                <div>
                                    <div>User banned</div>
                                    <div className="text-xs text-muted-foreground">
                                        {!hasUser
                                            ? "Not available — no user associated"
                                            : ACTION_DESCRIPTIONS.ban}
                                    </div>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Takedown Reason */}
            {actionTaken === "takedown" && (
                <div className="space-y-2">
                    <Label htmlFor="takedownReason">Takedown Reason</Label>
                    <Input
                        id="takedownReason"
                        placeholder="Enter reason for takedown..."
                        value={takedownReason}
                        onChange={(e) => setTakedownReason(e.target.value)}
                    />
                </div>
            )}

            {/* Action Consequences Warning */}
            {actionTaken && actionTaken !== "none" && (
                <div className="flex items-start gap-2 text-sm p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="text-yellow-700 dark:text-yellow-400">
                        {actionTaken === "takedown" && (
                            <>Content will be disabled. Owner will receive email notification and +1 TOS strike.</>
                        )}
                        {actionTaken === "warning" && (
                            <>Owner will receive a warning notification about policy concerns.</>
                        )}
                        {actionTaken === "ban" && (
                            <>User will be restricted from {report.serviceType === "alias" ? "creating aliases" : "uploading"}. Existing content remains accessible.</>
                        )}
                    </div>
                </div>
            )}

            {/* Anonymous drop notice for ban action */}
            {actionTaken === "ban" && report.serviceType === "drop" && !drop?.user && (
                <div className="flex items-start gap-2 text-sm p-3 bg-muted border rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-muted-foreground">
                        No user associated with this drop. Use takedown instead to disable the content.
                    </div>
                </div>
            )}

            {/* Review Notes */}
            <div className="space-y-2">
                <Label htmlFor="notes">Review Notes</Label>
                <Textarea
                    id="notes"
                    placeholder="Add notes about your review..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                />
            </div>
        </div>
    )
}
