
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { AddDomainDialog, DomainItem } from "@/components/domain"
import { getPlanLimits } from "@/lib/limits"
import { Progress } from "@/components/ui/progress"
import { AlertTriangle, Globe } from "lucide-react"
import Link from "next/link"
export default async function DomainsPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
    }) ?? null

    if (!user) redirect("/login")

    const domains = await prisma.domain.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
    }) as unknown as Array<{
        id: string
        domain: string
        verified: boolean
        ownershipVerified: boolean
        mxVerified: boolean
        spfVerified: boolean
        dnsVerified: boolean
        verificationToken: string
        dkimPublicKey: string | null
        dkimSelector: string | null
        dkimVerified: boolean
        scheduledForRemovalAt: Date | null
    }>
    const { domains: domainsLimit } = getPlanLimits(user)
    const usagePercent = domainsLimit === -1 ? 0 : Math.min((domains.length / domainsLimit) * 100, 100)
    const isUnlimited = domainsLimit === -1

    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-border/40 pb-6">
                <div className="space-y-1">
                    <h2 className="text-3xl font-medium tracking-tight font-serif">Domains</h2>
                    <p className="text-muted-foreground font-light">Manage your custom domains.</p>
                </div>
                <AddDomainDialog />
            </div>

            <div className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Domain Usage</span>
                    <span className="text-sm text-muted-foreground">
                        {domains.length} / {isUnlimited ? "∞" : domainsLimit}
                    </span>
                </div>
                <Progress value={usagePercent} className="h-2" />
            </div>

            {/* Downgrade Warning */}
            {user.downgradedAt && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">Your account has been downgraded to the free tier.</p>
                        <p className="text-destructive/80 mt-1">
                            Custom domains are not available on the free tier. Your domains will be scheduled
                            for removal 30 days after downgrade and permanently deleted 14 days later.{" "}
                            <Link href="/dashboard/billing" className="underline font-medium text-destructive">
                                Renew your subscription
                            </Link>{" "}
                            to keep your domains.
                        </p>
                    </div>
                </div>
            )}

            {domains.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border/60 rounded-3xl text-center bg-secondary/20">
                    <div className="rounded-full bg-secondary/50 p-4 mb-4">
                        <Globe className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-medium font-serif mb-2">No custom domains</h3>
                    <p className="mb-6 text-muted-foreground font-light max-w-sm mx-auto">
                        Connect your own domain to create branded aliases like you@yourdomain.com.
                    </p>
                    <AddDomainDialog />
                </div>
            ) : (
                <div className="grid gap-4">
                    {domains.map(domain => (
                        <DomainItem key={domain.id} domain={domain} />
                    ))}
                </div>
            )}
        </div>
    )
}
