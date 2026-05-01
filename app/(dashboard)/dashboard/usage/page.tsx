import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { getDisplayPlanLimits, getDropLimits, getEffectiveTier, getFormLimitsAsync } from "@/lib/limits"
import { formatBytes } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Mail, Globe, HardDrive, FileText, Inbox } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ApiUsageCard } from "@/components/dashboard"
import { FormService } from "@/lib/services/form"

export default async function UsagePage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
    })

    if (!user) redirect("/login")

    const [aliases, domains, formCount, recentSubmissions, formLimits] = await Promise.all([
        prisma.alias.findMany({ where: { userId: user.id }, select: { id: true, format: true } }) as unknown as Promise<Array<{ id: string; format: string }>>,
        prisma.domain.findMany({ where: { userId: user.id, verified: true }, select: { id: true } }) as unknown as Promise<Array<{ id: string }>>,
        FormService.countActiveForms(user.id),
        FormService.countRecentSubmissionsForOwner(user.id),
        getFormLimitsAsync(user.id),
    ])

    // Get limits
    const aliasLimits = getDisplayPlanLimits(user)
    const dropLimits = getDropLimits(user)
    const tier = getEffectiveTier(user)

    // Calculate alias counts
    const randomAliases = aliases.filter(a => a.format === "RANDOM").length
    const customAliases = aliases.filter(a => a.format === "CUSTOM").length
    const domainCount = domains.length

    // Storage usage
    const storageUsed = Number(user.storageUsed)
    const storageLimit = dropLimits.maxStorage

    // Calculate percentages
    const randomPercent = aliasLimits.random === -1 ? 0 : Math.min((randomAliases / aliasLimits.random) * 100, 100)
    const customPercent = aliasLimits.custom === -1 ? 0 : Math.min((customAliases / aliasLimits.custom) * 100, 100)
    const domainPercent = aliasLimits.domains === -1 ? 0 : Math.min((domainCount / aliasLimits.domains) * 100, 100)
    const storagePercent = storageLimit === 0 ? 0 : Math.min((storageUsed / storageLimit) * 100, 100)
    const formsPercent = formLimits.forms === -1 ? 0 : Math.min((formCount / formLimits.forms) * 100, 100)
    const submissionsPercent = formLimits.submissionsPerMonth === -1
        ? 0
        : Math.min((recentSubmissions / formLimits.submissionsPerMonth) * 100, 100)

    return (
        <div className="space-y-8">
            <div className="border-b border-border/40 pb-6">
                <h3 className="text-3xl font-medium tracking-tight font-serif">Usage</h3>
                <p className="text-sm text-muted-foreground font-light">
                    Monitor your usage against your plan limits.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Random Aliases */}
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <Mail className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Random Aliases</CardTitle>
                                <CardDescription className="text-sm">
                                    Auto-generated alias addresses
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Used</span>
                            <span className="font-medium">
                                {randomAliases} / {aliasLimits.random === -1 ? "∞" : aliasLimits.random}
                            </span>
                        </div>
                        <Progress value={randomPercent} className="h-2" />
                        {aliasLimits.random !== -1 && randomPercent >= 80 && (
                            <p className={`text-sm ${randomPercent >= 100 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                                {randomPercent >= 100
                                    ? "You've reached your random alias limit. Upgrade for more."
                                    : `You're using ${Math.round(randomPercent)}% of your random aliases.`}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Custom Aliases */}
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <Mail className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Custom Aliases</CardTitle>
                                <CardDescription className="text-sm">
                                    Personalized email addresses
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Used</span>
                            <span className="font-medium">
                                {customAliases} / {aliasLimits.custom === -1 ? "∞" : aliasLimits.custom}
                            </span>
                        </div>
                        <Progress value={customPercent} className="h-2" />
                        {aliasLimits.custom !== -1 && customPercent >= 80 && (
                            <p className={`text-sm ${customPercent >= 100 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                                {customPercent >= 100
                                    ? "You've reached your custom alias limit. Upgrade for more."
                                    : `You're using ${Math.round(customPercent)}% of your custom aliases.`}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Custom Domains */}
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <Globe className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Custom Domains</CardTitle>
                                <CardDescription className="text-sm">
                                    Verified domains for aliases
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Used</span>
                            <span className="font-medium">
                                {domainCount} / {aliasLimits.domains === -1 ? "∞" : aliasLimits.domains}
                            </span>
                        </div>
                        <Progress value={domainPercent} className="h-2" />
                        {aliasLimits.domains === 0 && (
                            <p className="text-xs text-muted-foreground">
                                Upgrade to Plus to add custom domains.
                            </p>
                        )}
                        {aliasLimits.domains > 0 && domainPercent >= 80 && (
                            <p className={`text-sm ${domainPercent >= 100 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                                {domainPercent >= 100
                                    ? "You've reached your domain limit. Upgrade for more."
                                    : `You're using ${Math.round(domainPercent)}% of your custom domains.`}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Storage/Bandwidth */}
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <HardDrive className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Bandwidth</CardTitle>
                                <CardDescription className="text-sm">
                                    Cumulative file uploads
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Used</span>
                            <span className="font-medium">
                                {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
                            </span>
                        </div>
                        <Progress value={storagePercent} className="h-2" />
                        {storageLimit > 0 && storagePercent >= 80 && (
                            <p className={`text-sm ${storagePercent >= 100 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                                {storagePercent >= 100
                                    ? "You've reached your storage limit. Upgrade for more."
                                    : `You're using ${Math.round(storagePercent)}% of your storage.`}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Forms */}
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Forms</CardTitle>
                                <CardDescription className="text-sm">
                                    Active end-to-end encrypted forms
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Used</span>
                            <span className="font-medium">
                                {formCount} / {formLimits.forms === -1 ? "∞" : formLimits.forms}
                            </span>
                        </div>
                        <Progress value={formsPercent} className="h-2" />
                        {formLimits.forms !== -1 && formsPercent >= 80 && (
                            <p className={`text-sm ${formsPercent >= 100 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                                {formsPercent >= 100
                                    ? "You've reached your form limit. Upgrade for more."
                                    : `You're using ${Math.round(formsPercent)}% of your forms.`}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Form Submissions */}
                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-6 pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10">
                                <Inbox className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Form Submissions</CardTitle>
                                <CardDescription className="text-sm">
                                    Rolling 30-day window
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Used</span>
                            <span className="font-medium">
                                {recentSubmissions.toLocaleString()} / {formLimits.submissionsPerMonth === -1 ? "∞" : formLimits.submissionsPerMonth.toLocaleString()}
                            </span>
                        </div>
                        <Progress value={submissionsPercent} className="h-2" />
                        {formLimits.submissionsPerMonth !== -1 && submissionsPercent >= 80 && (
                            <p className={`text-sm ${submissionsPercent >= 100 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                                {submissionsPercent >= 100
                                    ? "You've reached your submissions limit. Upgrade for more."
                                    : `You're using ${Math.round(submissionsPercent)}% of your monthly submissions.`}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* API Requests - Dynamic component */}
                <ApiUsageCard wide={tier === 'pro'} />

                {/* Upgrade Prompt Card — hidden for Pro users */}
                {tier !== 'pro' && (
                    <Card className="rounded-3xl border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm">
                        <CardHeader className="p-6 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-primary/20">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m3 16 4 4 4-4" />
                                        <path d="M7 20V4" />
                                        <path d="m21 8-4-4-4 4" />
                                        <path d="M17 4v16" />
                                    </svg>
                                </div>
                                <div>
                                    <CardTitle className="text-lg font-medium">Need More?</CardTitle>
                                    <CardDescription className="text-sm">
                                        Upgrade to unlock higher limits
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 pt-0 space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Get more aliases, storage, and API requests with our Plus and Pro plans.
                            </p>
                            <Button asChild className="rounded-full w-full">
                                <Link href="/dashboard/billing">
                                    View Plans
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
