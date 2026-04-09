import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

import { Plus, Users, AlertTriangle } from "lucide-react"
import { CreateAliasDialog, AliasList } from "@/components/alias"
import { getDisplayPlanLimits } from "@/lib/limits"
import { Progress } from "@/components/ui/progress"
import { RecipientService } from "@/lib/services/recipient"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function DashboardPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
    }) ?? null

    if (!user) redirect("/login")

    // Ensure user has a default recipient
    await RecipientService.ensureDefaultRecipient(user.id, user.email!)

    // Fetch verified recipients
    const recipients = await RecipientService.getVerifiedRecipients(user.id)

    const aliases = await prisma.alias.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        include: {
            recipient: {
                select: {
                    id: true,
                    email: true,
                    pgpPublicKey: true,
                }
            }
        }
    }) as unknown as Array<{
        id: string
        email: string
        format: string
        domain: string
        active: boolean
        label: string | null
        note: string | null
        emailsReceived: number
        emailsBlocked: number
        lastEmailAt: Date | null
        createdAt: Date
        recipientId: string | null
        recipient: { id: string; email: string; pgpPublicKey: string | null } | null
    }>

    const customCount = aliases.filter((a) => a.format === "CUSTOM").length
    const randomCount = aliases.filter((a) => a.format === "RANDOM").length

    const { random: randomLimit, custom: customLimit } = getDisplayPlanLimits(user)

    // Calculate percentages
    const randomPercent = randomLimit === -1 ? 0 : Math.min((randomCount / randomLimit) * 100, 100)
    const customPercent = customLimit === -1 ? 0 : Math.min((customCount / customLimit) * 100, 100)

    // Fetch custom domains for the current user only
    let domains: { id: string, domain: string, verified: boolean }[] = []
    try {
        domains = await prisma.domain.findMany({
            where: { userId: user.id },
            select: { id: true, domain: true, verified: true }
        })
    } catch {
        // Non-critical: domains list enhances the alias form but isn't required.
        // Fall through with empty domains array; user can still create aliases on anon.li.
    }

    // Add the main anon.li domain as a shared domain
    const sharedDomains = [
        { id: "anon.li", domain: "anon.li", verified: true }
    ]

    const allDomains = [...sharedDomains, ...domains]

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
                <div className="space-y-1">
                    <h2 className="text-3xl font-medium tracking-tight font-serif">Aliases</h2>
                    <p className="text-muted-foreground font-light">Manage your anonymous email aliases.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" asChild>
                        <Link href="/dashboard/alias/recipients">
                            <Users className="h-4 w-4 mr-2" />
                            Recipients
                        </Link>
                    </Button>
                    <CreateAliasDialog domains={allDomains} recipients={recipients} />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Random Aliases</span>
                        <span className="text-sm text-muted-foreground">{randomCount} / {randomLimit === -1 ? "∞" : randomLimit}</span>
                    </div>
                    <Progress value={randomPercent} className="h-2" />
                </div>
                <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Custom Aliases</span>
                        <span className="text-sm text-muted-foreground">{customCount} / {customLimit === -1 ? "∞" : customLimit}</span>
                    </div>
                    <Progress value={customPercent} className="h-2" />
                </div>
            </div>

            {/* Downgrade Warning */}
            {user.downgradedAt && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">Your account has been downgraded to the free tier.</p>
                        <p className="text-destructive/80 mt-1">
                            Excess resources will be scheduled for removal 30 days after downgrade
                            and permanently deleted 14 days later.{" "}
                            <Link href="/dashboard/billing" className="underline font-medium text-destructive">
                                Renew your subscription
                            </Link>{" "}
                            to keep all your resources.
                        </p>
                    </div>
                </div>
            )}

            {/* Usage Warnings */}
            {randomLimit !== -1 && (randomCount / randomLimit) >= 0.8 && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${(randomCount / randomLimit) >= 1
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}>
                    <span>
                        {(randomCount / randomLimit) >= 1
                            ? "You've reached your random alias limit. Upgrade for more."
                            : `You're using ${Math.round((randomCount / randomLimit) * 100)}% of your random aliases.`
                        }
                    </span>
                </div>
            )}

            {customLimit !== -1 && (customCount / customLimit) >= 0.8 && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${(customCount / customLimit) >= 1
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    }`}>
                    <span>
                        {(customCount / customLimit) >= 1
                            ? "You've reached your custom alias limit. Upgrade for more."
                            : `You're using ${Math.round((customCount / customLimit) * 100)}% of your custom aliases.`
                        }
                    </span>
                </div>
            )}

            {aliases.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border/60 rounded-3xl text-center animate-in fade-in-50 bg-secondary/20">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
                        <Plus className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-medium font-serif mb-2">No aliases created</h3>
                    <p className="mb-6 text-muted-foreground font-light max-w-sm mx-auto">
                        You haven&apos;t created any aliases yet. Create one to start protecting your identity.
                    </p>
                    <div className="scale-110">
                        <CreateAliasDialog domains={allDomains} recipients={recipients} />
                    </div>
                </div>
            ) : (
                <AliasList aliases={aliases} recipients={recipients} />
            )}
        </div>
    )
}
