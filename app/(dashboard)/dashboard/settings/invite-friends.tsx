"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Copy, Gift, Users } from "lucide-react"
import { toast } from "sonner"

interface InviteFriendsProps {
    link: string
    successfulReferrals: number
    /** ISO date string, or null if the user has no complimentary Plus. */
    plusUntil: string | null
    rewardDays: number
}

export function InviteFriends({ link, successfulReferrals, plusUntil, rewardDays }: InviteFriendsProps) {
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        toast.success("Referral link copied!")
        setTimeout(() => setCopied(false), 2000)
    }

    const plusUntilLabel = plusUntil
        ? new Date(plusUntil).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        : null

    return (
        <Card className="rounded-3xl border-border/40 shadow-sm">
            <CardContent className="p-6 space-y-5">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Gift className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <p className="font-medium">Invite friends, get Plus free</p>
                        <p className="text-sm text-muted-foreground">
                            When a friend signs up with your link, you <span className="text-foreground">both</span> get {rewardDays} days of Plus for free, and it stacks with every referral.
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Input
                        value={link}
                        readOnly
                        aria-label="Your referral link"
                        className="font-mono text-xs rounded-xl bg-secondary/30 border-0 h-11"
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={copy}
                        aria-label="Copy referral link"
                        className="h-11 w-11 rounded-xl shrink-0 border-border/50 hover:border-primary/30 hover:bg-primary/5"
                    >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        {successfulReferrals} {successfulReferrals === 1 ? "friend" : "friends"} joined
                    </span>
                    {plusUntilLabel && (
                        <span className="inline-flex items-center gap-2">
                            <Gift className="h-4 w-4 text-primary" />
                            Plus active until {plusUntilLabel}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
