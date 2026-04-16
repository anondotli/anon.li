"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LoginForm } from "@/components/auth"
import type { LoginFormView } from "@/components/auth/login-form"
import Link from "next/link"
import { Icons } from "@/components/shared/icons"

const PRODUCT_DASHBOARDS: Record<string, string> = {
    alias: "/dashboard/alias",
    drop: "/dashboard/drop",
}

export function LoginPageContent() {
    const [emailSent, setEmailSent] = useState(false)
    const searchParams = useSearchParams()
    const from = searchParams.get("from")
    const requestedMode = searchParams.get("mode")
    const requestedView: LoginFormView = requestedMode === "reset" ? "forgot-password" : "login"
    const [view, setView] = useState<LoginFormView>(requestedView)
    const callbackUrl = (from && PRODUCT_DASHBOARDS[from]) || undefined
    const isResetView = view === "forgot-password"

    useEffect(() => {
        setView(requestedView)
    }, [requestedView])

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
                                {isResetView ? "Reset your password" : "Welcome back"}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {isResetView
                                    ? "Enter your email and we’ll send you a secure reset link."
                                    : "Sign in to your account"}
                            </p>
                        </div>
                    </div>
                )}
                <LoginForm
                    mode="login"
                    onEmailSentChange={setEmailSent}
                    callbackUrl={callbackUrl}
                    initialView={view}
                    onViewChange={setView}
                />
                {!emailSent && (
                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{" "}
                        <Link
                            href={from ? `/register?from=${from}` : "/register"}
                            className="font-medium text-primary hover:underline"
                        >
                            Sign up
                        </Link>
                    </p>
                )}
            </div>
        </div>
    )
}
