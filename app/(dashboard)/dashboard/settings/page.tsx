import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Key, ChevronRight } from "lucide-react"

import { SettingsForm } from "./settings-form"
import { DeleteAccountSection } from "./delete-account"
import { DataExportSection } from "./data-export"
import { TwoFactorSettings } from "./two-factor-settings"
import { SessionManagement } from "./session-management"
import { ConnectedApps } from "./connected-apps"
import { Card, CardContent } from "@/components/ui/card"
import { headers } from "next/headers"
import { auth as betterAuth } from "@/lib/auth"
import { PasswordSettings } from "@/components/vault/password-settings"
import { InviteFriends } from "./invite-friends"
import { getReferralStats, REFERRAL_REWARD_DAYS } from "@/lib/services/referral"
import { getConnectedApps } from "@/lib/data/connected-apps"

export default async function SettingsPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
    })

    if (!user) redirect("/login")

    const [referral, connectedApps] = await Promise.all([
        getReferralStats(session.user.id),
        getConnectedApps(session.user.id),
    ])
    const referralLink = `${process.env.NEXT_PUBLIC_APP_URL}/?ref=${referral.code}`

    // Resolve via better-auth instead of reading the cookie by name — the name
    // carries a `__Secure-` prefix in production.
    const currentSession = await betterAuth.api.getSession({ headers: await headers() })
    const currentSessionId = currentSession?.session?.id ?? null

    const sessionData = (await prisma.session.findMany({
        where: {
            userId: session.user.id,
            expiresAt: { gt: new Date() },
        },
        select: {
            id: true,
            userAgent: true,
            createdAt: true,
        },
        orderBy: { createdAt: "desc" },
    })).map((activeSession) => ({
        id: activeSession.id,
        userAgent: activeSession.userAgent,
        createdAt: activeSession.createdAt,
        isCurrent: activeSession.id === currentSessionId,
    }))

    return (
        <div className="space-y-8">
            <div className="border-b border-border/40 pb-6">
                <h3 className="text-3xl font-medium tracking-tight font-serif">Settings</h3>
                <p className="text-sm text-muted-foreground font-light">
                    Manage your account settings and preferences.
                </p>
            </div>
            <div className="grid gap-8">
                {/* Profile */}
                <SettingsForm user={user} />

                {/* Invite & earn */}
                <div className="space-y-2">
                    <h4 className="text-lg font-medium font-serif text-muted-foreground px-1">Invite &amp; earn</h4>
                    <InviteFriends
                        link={referralLink}
                        successfulReferrals={referral.successfulReferrals}
                        plusUntil={referral.plusUntil ? referral.plusUntil.toISOString() : null}
                        rewardDays={REFERRAL_REWARD_DAYS}
                    />
                </div>

                {/* Security */}
                <div className="space-y-2">
                    <h4 className="text-lg font-medium font-serif text-muted-foreground px-1">Security</h4>
                    <div className="grid gap-6">
                        <PasswordSettings />
                        <TwoFactorSettings />
                        <Card className="rounded-3xl border-border/40 shadow-sm">
                            <CardContent className="p-6">
                                <Link
                                    href="/dashboard/api-keys"
                                    className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                                            <Key className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Developer Access</p>
                                            <p className="text-sm text-muted-foreground">Manage API keys for programmatic access</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                            </CardContent>
                        </Card>
                        <SessionManagement sessions={sessionData} />
                        <ConnectedApps apps={connectedApps} />
                    </div>
                </div>

                {/* Data Control */}
                <div className="space-y-2">
                    <h4 className="text-lg font-medium font-serif text-muted-foreground px-1">Data Control</h4>
                    <div className="grid gap-6">
                        <DataExportSection />
                        <DeleteAccountSection />
                    </div>
                </div>
            </div>
        </div>
    )
}
