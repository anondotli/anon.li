"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Monitor, Smartphone, Globe, Loader2, Trash2, LogOut } from "lucide-react"
import { toast } from "sonner"
import { revokeSessionAction, revokeAllOtherSessionsAction } from "@/actions/session"
import { formatRelativeTime } from "@/lib/utils"

interface SessionInfo {
    id: string
    userAgent: string | null
    createdAt: Date
    isCurrent: boolean
}

interface SessionManagementProps {
    sessions: SessionInfo[]
}

function getDeviceIcon(userAgent: string | null) {
    if (!userAgent) return Globe
    const ua = userAgent.toLowerCase()
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
        return Smartphone
    }
    return Monitor
}

function getDeviceName(userAgent: string | null): string {
    if (!userAgent) return "Unknown device"
    const ua = userAgent.toLowerCase()

    let browser = "Unknown browser"
    if (ua.includes("firefox")) browser = "Firefox"
    else if (ua.includes("edg")) browser = "Edge"
    else if (ua.includes("chrome")) browser = "Chrome"
    else if (ua.includes("safari")) browser = "Safari"

    let os = ""
    if (ua.includes("mac")) os = "macOS"
    else if (ua.includes("windows")) os = "Windows"
    else if (ua.includes("linux")) os = "Linux"
    else if (ua.includes("android")) os = "Android"
    else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS"

    return os ? `${browser} on ${os}` : browser
}

export function SessionManagement({ sessions }: SessionManagementProps) {
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const [revokingAll, setRevokingAll] = useState(false)

    const handleRevoke = async (sessionId: string) => {
        setRevokingId(sessionId)
        try {
            const result = await revokeSessionAction(sessionId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Session revoked")
            }
        } catch {
            toast.error("Failed to revoke session")
        } finally {
            setRevokingId(null)
        }
    }

    const handleRevokeAll = async () => {
        setRevokingAll(true)
        try {
            const result = await revokeAllOtherSessionsAction()
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("All other sessions revoked")
            }
        } catch {
            toast.error("Failed to revoke sessions")
        } finally {
            setRevokingAll(false)
        }
    }

    const otherSessions = sessions.filter(s => !s.isCurrent)

    return (
        <Card className="rounded-3xl border-border/40 shadow-sm">
            <CardHeader className="p-8 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-medium font-serif">Active Sessions</CardTitle>
                        <CardDescription>
                            Devices currently signed in to your account.
                        </CardDescription>
                    </div>
                    {otherSessions.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRevokeAll}
                            disabled={revokingAll}
                        >
                            {revokingAll ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <LogOut className="h-4 w-4" />
                            )}
                            Sign out all others
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-8 pt-4">
                <div className="grid gap-3 max-h-[340px] overflow-y-auto">
                    {sessions.map((session) => {
                        const DeviceIcon = getDeviceIcon(session.userAgent)
                        return (
                            <div
                                key={session.id}
                                className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/10"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                                        <DeviceIcon className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-sm">
                                                {getDeviceName(session.userAgent)}
                                            </p>
                                            {session.isCurrent && (
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Signed in {formatRelativeTime(session.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                {!session.isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive"
                                        onClick={() => handleRevoke(session.id)}
                                        disabled={revokingId === session.id}
                                    >
                                        {revokingId === session.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
