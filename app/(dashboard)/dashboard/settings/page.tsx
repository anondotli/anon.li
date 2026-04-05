import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Key, ChevronRight } from "lucide-react"

import { SettingsForm } from "./settings-form"
import { DeleteAccountSection } from "./delete-account"
import { DataExportSection } from "./data-export"
import { LocalDevicePrivacySection } from "./local-device-privacy"
import { TwoFactorSettings } from "./two-factor-settings"
import { SessionManagement } from "./session-management"
import { Card, CardContent } from "@/components/ui/card"
import { cookies } from "next/headers"

export default async function SettingsPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
    })

    if (!user) redirect("/login")

    // Fetch active sessions for session management
    const sessions = await prisma.session.findMany({
        where: { userId: session.user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            token: true,
            userAgent: true,
            createdAt: true,
        },
    })

    const cookieStore = await cookies()
    const currentSessionToken = cookieStore.get("better-auth.session_token")?.value?.split(".")[0] ?? ""

    const sessionData = sessions.map(s => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        isCurrent: s.token === currentSessionToken,
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

                {/* Security */}
                <div className="space-y-2">
                    <h4 className="text-lg font-medium font-serif text-muted-foreground px-1">Security</h4>
                    <div className="grid gap-6">
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
                        <SessionManagement sessions={sessionData} currentSessionToken={currentSessionToken} />
                    </div>
                </div>

                {/* Data Control */}
                <div className="space-y-2">
                    <h4 className="text-lg font-medium font-serif text-muted-foreground px-1">Data Control</h4>
                    <div className="grid gap-6">
                        <LocalDevicePrivacySection />
                        <DataExportSection />
                        <DeleteAccountSection />
                    </div>
                </div>
            </div>
        </div>
    )
}
