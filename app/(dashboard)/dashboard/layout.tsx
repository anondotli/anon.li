import { auth } from "@/auth"
import { DashboardNav, UserNav, DashboardBranding, DashboardMobileNav } from "@/components/dashboard"
import { FileDropProvider } from "@/components/drop/provider"
import { VaultProvider } from "@/components/vault/vault-provider"
import { VaultGate } from "@/components/vault/vault-gate"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { AlertTriangle } from "lucide-react"
import { getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE } from "@/lib/vault/schema"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await auth()

    if (!session?.user) {
        redirect("/login")
    }

    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        redirect("/2fa")
    }

    const vaultSchema = await getVaultSchemaState()

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            banned: true,
            banReason: true,
            banAliasCreation: true,
            banFileUpload: true,
        }
    })

    // Revoke sessions and redirect if user doesn't exist
    if (!user) {
        await prisma.session.deleteMany({ where: { userId: session.user.id } })
        redirect("/login")
    }

    if (vaultSchema.userSecurity) {
        const security = await prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
        })

        if (!security) {
            redirect("/setup")
        }
    }

    return (
        <FileDropProvider>
        <VaultProvider enabled={vaultSchema.userSecurity}>
        <div className="flex min-h-screen flex-col bg-background">
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
                <div className="container flex h-16 items-center">
                    <DashboardMobileNav />
                    <DashboardBranding />
                    <div className="flex flex-1 items-center justify-end space-x-2">
                        <UserNav user={session.user} />
                    </div>
                </div>
            </header>

            {(user?.banned || user?.banAliasCreation || user?.banFileUpload) && (
                <div className="bg-destructive/15 border-b border-destructive/20 text-destructive px-4 py-3 text-sm text-center font-medium flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                        {user.banned
                            ? `ACCOUNT SUSPENDED: ${user.banReason || "Your account has been restricted due to a violation of our terms."}`
                            : `ACCOUNT RESTRICTED: ${[
                                user.banAliasCreation ? "Alias Link Creation" : "",
                                user.banFileUpload ? "File Uploads" : ""
                            ].filter(Boolean).join(" & ")} blocked.`
                        }
                    </span>
                </div>
            )}

            {!vaultSchema.userSecurity && (
                <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-700 dark:text-amber-300">
                    {VAULT_SCHEMA_UNAVAILABLE_MESSAGE} Existing dashboard features remain available.
                </div>
            )}

            <div className="container flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
                <aside className="fixed top-16 z-30 -ml-2 hidden h-[calc(100vh-4rem)] w-full shrink-0 overflow-y-auto md:sticky md:block border-r border-border/40">
                    <div className="py-8 pr-6">
                        <DashboardNav />
                    </div>
                </aside>
                <main id="main-content" className="flex w-full flex-col overflow-hidden py-8">
                    <VaultGate>{children}</VaultGate>
                </main>
            </div>
        </div>
        </VaultProvider>
        </FileDropProvider>
    )
}
