"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { HardDriveDownload, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
    clearAllStoredEncryptionKeys,
    dropKeyRetentionDays,
    getLocalDevicePrivacySnapshot,
    setDropKeyStoragePreferences,
    type LocalDevicePrivacySnapshot,
} from "@/lib/upload-resume.client"

export function LocalDevicePrivacySection() {
    const [snapshot, setSnapshot] = useState<LocalDevicePrivacySnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const nextSnapshot = await getLocalDevicePrivacySnapshot()
            setSnapshot(nextSnapshot)
        } catch {
            toast.error("Failed to load this browser's local privacy settings")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        refresh()
    }, [refresh])

    const latestExpiry = useMemo(() => {
        if (!snapshot || snapshot.storedKeys.length === 0) return null

        return snapshot.storedKeys
            .map((entry) => entry.expiresAt)
            .sort((left, right) => right - left)[0] ?? null
    }, [snapshot])

    const handleRememberKeysChange = async (checked: boolean) => {
        setSaving(true)
        try {
            setDropKeyStoragePreferences({ rememberDropKeys: checked })

            if (!checked) {
                await clearAllStoredEncryptionKeys()
                toast.success("Saved Drop keys were removed from this browser")
            } else {
                toast.success("This browser will remember Drop keys you create here")
            }

            await refresh()
        } catch {
            toast.error("Failed to update local key storage preference")
        } finally {
            setSaving(false)
        }
    }

    const handleClearKeys = async () => {
        setSaving(true)
        try {
            await clearAllStoredEncryptionKeys()
            toast.success("Saved Drop keys cleared from this browser")
            await refresh()
        } catch {
            toast.error("Failed to clear saved Drop keys")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card className="rounded-3xl border-border/40 shadow-sm overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                            <HardDriveDownload className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-medium">Local Device Privacy</CardTitle>
                            <CardDescription className="text-sm">
                                Control what this browser keeps locally for Drop links and upload recovery.
                            </CardDescription>
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={refresh}
                        disabled={loading || saving}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Refreshing...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            Saved Drop keys live in this browser profile so the dashboard can rebuild share links and decrypt Drop metadata. They are local convenience data, not an additional layer of encryption.
                        </span>
                    </p>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4">
                    <div className="space-y-1">
                        <p className="font-medium">Remember Drop keys on this browser</p>
                        <p className="text-sm text-muted-foreground">
                            When enabled, new Drop keys created here are saved locally for {dropKeyRetentionDays} days unless you clear them sooner.
                        </p>
                    </div>
                    <Switch
                        checked={snapshot?.preferences.rememberDropKeys ?? true}
                        onCheckedChange={handleRememberKeysChange}
                        disabled={loading || saving}
                        aria-label="Remember Drop keys on this browser"
                    />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <DeviceStat
                        icon={KeyRound}
                        label="Saved Drop keys"
                        value={loading ? "..." : String(snapshot?.storedKeys.length ?? 0)}
                        detail={latestExpiry ? `Latest expiry ${formatTimestamp(latestExpiry)}` : "Nothing stored right now"}
                    />
                    <DeviceStat
                        icon={ShieldAlert}
                        label="Retention"
                        value={`${dropKeyRetentionDays} days`}
                        detail="New saved keys expire automatically on this device"
                    />
                </div>

                <Button
                    variant="outline"
                    onClick={handleClearKeys}
                    disabled={saving || (snapshot?.storedKeys.length ?? 0) === 0}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear saved Drop keys
                </Button>
            </CardContent>
        </Card>
    )
}

function DeviceStat({
    icon: Icon,
    label,
    value,
    detail,
}: {
    icon: typeof KeyRound
    label: string
    value: string
    detail: string
}) {
    return (
        <div className="rounded-2xl border border-border/50 bg-background p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-medium tracking-tight">{value}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
        </div>
    )
}

function formatTimestamp(timestamp: number) {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(timestamp))
}
