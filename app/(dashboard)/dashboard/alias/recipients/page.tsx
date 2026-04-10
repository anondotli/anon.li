import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { RecipientService } from "@/lib/services/recipient"
import { getRecipientLimit } from "@/lib/limits"
import { prisma } from "@/lib/prisma"
import { Progress } from "@/components/ui/progress"
import { RecipientList, AddRecipientDialog } from "@/components/recipients"
import { Mail, ArrowLeft, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function RecipientsPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            email: true,
            stripePriceId: true,
            stripeCurrentPeriodEnd: true,
            downgradedAt: true,
        }
    })

    if (!user) redirect("/login")

    // Ensure user has a default recipient
    await RecipientService.ensureDefaultRecipient(user.id, user.email!)

    // Fetch recipients
    const recipients = await RecipientService.getRecipients(user.id)
    const recipientLimit = getRecipientLimit(user)
    const recipientCount = recipients.length
    const recipientPercent = recipientLimit === -1 ? 0 : Math.min((recipientCount / recipientLimit) * 100, 100)

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                            <Link href="/dashboard/alias">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <h2 className="text-2xl font-medium tracking-tight font-serif sm:text-3xl">Recipients</h2>
                    </div>
                    <p className="pl-11 text-sm font-light text-muted-foreground sm:text-base">
                        Manage email addresses where your aliases forward to.
                    </p>
                </div>
                <div className="w-full sm:w-auto">
                    <AddRecipientDialog
                        currentCount={recipientCount}
                        maxCount={recipientLimit}
                        triggerClassName="w-full sm:w-auto"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">Recipients</span>
                        <span className="text-sm text-muted-foreground">
                            {recipientCount} / {recipientLimit === -1 ? "∞" : recipientLimit}
                        </span>
                    </div>
                    <Progress value={recipientPercent} className="h-2" />
                </div>
                <div className="border rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">Verified</span>
                        <span className="text-sm text-muted-foreground">
                            {recipients.filter(r => r.verified).length} of {recipientCount}
                        </span>
                    </div>
                    <Progress 
                        value={recipientCount > 0 ? (recipients.filter(r => r.verified).length / recipientCount) * 100 : 0} 
                        className="h-2" 
                    />
                </div>
            </div>

            {/* Downgrade Warning */}
            {user.downgradedAt && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">Your account has been downgraded to the free tier.</p>
                        <p className="text-destructive/80 mt-1">
                            Excess recipients will be scheduled for removal 30 days after downgrade
                            and permanently deleted 14 days later.{" "}
                            <Link href="/dashboard/billing" className="underline font-medium text-destructive">
                                Renew your subscription
                            </Link>{" "}
                            to keep all your recipients.
                        </p>
                    </div>
                </div>
            )}

            {/* Usage Warning */}
            {recipientLimit !== -1 && recipientCount >= recipientLimit && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
                    <span>
                        You&apos;ve reached your recipient limit. Upgrade to add more forwarding addresses.
                    </span>
                </div>
            )}

            {recipients.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-secondary/20 p-8 text-center animate-in fade-in-50 sm:p-12">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
                        <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-medium font-serif mb-2">No recipients yet</h3>
                    <p className="mb-6 text-muted-foreground font-light max-w-sm mx-auto">
                        Add an email address to forward your alias emails to.
                    </p>
                    <div className="w-full sm:w-auto sm:scale-110">
                        <AddRecipientDialog
                            currentCount={recipientCount}
                            maxCount={recipientLimit}
                            triggerClassName="w-full sm:w-auto"
                        />
                    </div>
                </div>
            ) : (
                <RecipientList recipients={recipients} />
            )}
        </div>
    )
}
