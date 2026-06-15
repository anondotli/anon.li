"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Gift } from "lucide-react"
import { LoginForm } from "@/components/auth"
import Link from "next/link"
import { Icons } from "@/components/shared/icons"

const PRODUCT_DASHBOARDS: Record<string, string> = {
    alias: "/dashboard/alias",
    drop: "/dashboard/drop",
}

interface RegisterPageContentProps {
    /** Days of Plus the visitor will receive on signup via a valid pending
     *  referral, or null when there's no referral to honor. */
    referralRewardDays?: number | null
}

export function RegisterPageContent({ referralRewardDays = null }: RegisterPageContentProps) {
    const [emailSent, setEmailSent] = useState(false)
    const searchParams = useSearchParams()
    const from = searchParams.get("from")
    const callbackUrl = (from && PRODUCT_DASHBOARDS[from]) || undefined

    return (
        <div className="flex min-h-svh flex-col items-center justify-center px-4 py-24">
            <div className="w-full max-w-sm">
                {!emailSent && (
                    <div className="mb-8 flex flex-col items-center gap-4">
                        <Link href="/" className="rounded-lg bg-primary/10 p-2 transition-colors hover:bg-primary/15">
                            <Icons.logo className="h-6 w-6 text-primary" />
                        </Link>
                        <div className="text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                Create an account
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Continue with a magic link or social sign-in
                            </p>
                        </div>
                    </div>
                )}
                {!emailSent && referralRewardDays ? (
                    <div className="mb-6 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Gift className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm">
                            <span className="font-medium">You&apos;ve been referred!</span>{" "}
                            <span className="text-muted-foreground">
                                Create your account to get {referralRewardDays} days of Plus, free.
                            </span>
                        </p>
                    </div>
                ) : null}
                <LoginForm mode="register" onEmailSentChange={setEmailSent} callbackUrl={callbackUrl} />
                {!emailSent && (
                    <div className="mt-6 space-y-3">
                        <p className="text-center text-sm text-muted-foreground">
                            Already have an account?{" "}
                            <Link
                                href={from ? `/login?from=${from}` : "/login"}
                                className="font-medium text-primary hover:underline"
                            >
                                Sign in
                            </Link>
                        </p>
                        <p className="text-center text-xs text-muted-foreground/70 leading-relaxed">
                            By continuing, you agree to our{" "}
                            <Link
                                href="/terms"
                                className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
                            >
                                Terms
                            </Link>{" "}
                            and{" "}
                            <Link
                                href="/privacy"
                                className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
                            >
                                Privacy Policy
                            </Link>
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
