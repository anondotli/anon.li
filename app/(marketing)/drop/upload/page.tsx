import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { FileUploader } from "@/components/drop"
import { Button } from "@/components/ui/button"
import { Lock, Shield, ArrowRight } from "lucide-react"
import { DROP_SIZE_LIMITS, EXPIRY_LIMITS } from "@/config/plans"
import { getDropLimits, getEffectiveTier } from "@/lib/limits"
import { formatBytes } from "@/lib/utils"

export const metadata: Metadata = {
    title: "Upload & Share Files",
    description: "Upload files with end-to-end encryption. No registration required. Files are encrypted in your browser before upload.",
    openGraph: {
        title: "Upload & Share Files",
        description: "End-to-end encrypted file sharing. No registration required.",
        type: "website",
    },
}

export default async function PublicUploadPage() {
    const session = await auth()
    const isLoggedIn = !!session?.user

    let userPlan: string | null = null
    let storageUsed = BigInt(0)
    let storageLimit = BigInt(0)
    let userLimits = getDropLimits(null)

    if (session?.user?.id) {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                stripePriceId: true,
                stripeCurrentPeriodEnd: true,
                storageUsed: true
            }
        })

        userLimits = getDropLimits(user)
        userPlan = getEffectiveTier(user)
        storageUsed = user?.storageUsed ?? BigInt(0)
        storageLimit = BigInt(userLimits.maxStorage)
    } else {
        userLimits = getDropLimits(null)
    }

    const guestLimits = {
        maxDropSize: DROP_SIZE_LIMITS.guest,
        maxExpiry: EXPIRY_LIMITS.guest,
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col">
            {/* Hero section with uploader */}
            <section className="flex-1 flex items-center justify-center py-12 md:py-20">
                <div className="container max-w-2xl px-4">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-sm mb-6">
                            <Lock className="h-3.5 w-3.5 text-primary" />
                            <span className="text-primary/80">End-to-End Encrypted</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight mb-4">
                            Share Files Securely
                        </h1>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto">
                            Your files are encrypted before they leave your device. We never see your data.
                        </p>
                    </div>

                    {/* Uploader */}
                    <div className="bg-card border rounded-2xl p-6 md:p-8 shadow-sm">
                        <FileUploader
                            userTier={userPlan}
                            maxStorage={storageLimit}
                            usedStorage={storageUsed}
                            isAuthenticated={isLoggedIn}
                        />
                    </div>

                    {/* Limits info */}
                    <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                        <span>
                            Max {isLoggedIn
                                ? formatBytes(Number(storageLimit - storageUsed))
                                : formatBytes(guestLimits.maxDropSize)
                            }
                        </span>
                        <span>•</span>
                        <span>
                            {isLoggedIn
                                ? (userLimits.maxExpiry === -1 ? "Never expires" : `${userLimits.maxExpiry} day expiry`)
                                : `${guestLimits.maxExpiry * 24}h expiry`
                            }
                        </span>
                        {!isLoggedIn && (
                            <>
                                <span>•</span>
                                <Link href="/register?from=drop" className="text-primary hover:underline">
                                    Sign up for more
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* Bottom CTA for guests */}
            {!isLoggedIn && (
                <section className="border-t bg-muted/30 py-8">
                    <div className="container max-w-2xl px-4">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Shield className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-medium">Want more bandwidth?</p>
                                    <p className="text-sm text-muted-foreground">
                                        Up to 250GB on Pro. 5GB free.
                                    </p>
                                </div>
                            </div>
                            <Button asChild className="rounded-full">
                                <Link href="/register?from=drop">
                                    Create Account <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    </div>
                </section>
            )}
        </div>
    )
}
