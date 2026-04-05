"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Key, Loader2 } from "lucide-react"

interface QuotaData {
    used: number
    limit: number
    remaining: number
    resetAt: string | null
    unlimited: boolean
}

interface ApiUsageResponse {
    alias: QuotaData
    drop: QuotaData
}

interface ApiUsageCardProps {
    /** Show as compact card (used in api-keys page) or grid card (used in usage page) */
    variant?: "compact" | "grid"
    /** Span both columns (for Pro users on usage page) */
    wide?: boolean
}

function QuotaSection({ label, quota }: { label: string; quota: QuotaData }) {
    const percent = !quota.unlimited && quota.limit > 0
        ? Math.min((quota.used / quota.limit) * 100, 100)
        : 0

    const formatResetDate = (dateStr: string | null) => {
        if (!dateStr) return null
        const date = new Date(dateStr)
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        })
    }

    if (quota.unlimited) {
        return (
            <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium text-green-600">Unlimited</span>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Used this month</span>
                <span className="font-medium">
                    {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
                </span>
            </div>
            <Progress value={percent} className="h-2" />
            {percent >= 80 && (
                <div className={`px-3 py-2 rounded-lg text-sm ${
                    percent >= 100
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                }`}>
                    {percent >= 100
                        ? "You've reached your API limit. Upgrade for more requests."
                        : `You're using ${Math.round(percent)}% of your monthly API quota.`}
                </div>
            )}
            {quota.resetAt && (
                <p className="text-xs text-muted-foreground">
                    Resets on {formatResetDate(quota.resetAt)}
                </p>
            )}
        </div>
    )
}

export function ApiUsageCard({ variant = "grid", wide = false }: ApiUsageCardProps) {
    const [usage, setUsage] = useState<ApiUsageResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchUsage() {
            try {
                const res = await fetch("/api/user/usage")
                if (!res.ok) {
                    throw new Error("Failed to fetch usage")
                }
                const data = await res.json()
                setUsage(data)
            } catch {
                setError("Could not load API usage")
            } finally {
                setLoading(false)
            }
        }

        fetchUsage()
    }, [])

    return (
        <Card className={`rounded-3xl border-border/40 shadow-sm${wide ? " md:col-span-2" : ""}`}>
            <CardHeader className="p-6 pb-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-green-500/10">
                        <Key className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                        <CardTitle className="text-lg font-medium">
                            {variant === "compact" ? "API Usage" : "API Requests"}
                        </CardTitle>
                        <CardDescription className="text-sm">
                            {variant === "compact" ? "Monthly API request limit" : "Monthly API call usage"}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-2">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <p className="text-sm text-muted-foreground">{error}</p>
                ) : usage ? (
                    <div className={wide ? "grid md:grid-cols-2 gap-6" : "space-y-4"}>
                        <QuotaSection label="Alias API" quota={usage.alias} />
                        <QuotaSection label="Drop API" quota={usage.drop} />
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )
}
