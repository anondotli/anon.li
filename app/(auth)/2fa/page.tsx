import { Metadata } from "next"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { auth } from "@/auth"
import { TwoFactorVerifyForm } from "./verify-form"
import { LogoutButton } from "./logout-button"

export const metadata: Metadata = {
    title: "Verify 2FA",
    description: "Enter your two-factor authentication code",
}

const TWO_FACTOR_COOKIE_NAMES = ["better-auth.two_factor", "__Secure-better-auth.two_factor"] as const

async function hasPendingTwoFactorCookie() {
    const cookieStore = await cookies()
    return TWO_FACTOR_COOKIE_NAMES.some((name) => Boolean(cookieStore.get(name)?.value))
}

export default async function Verify2FAPage() {
    const session = await auth()
    const pendingTwoFactor = await hasPendingTwoFactorCookie()
    if (!session && !pendingTwoFactor) redirect("/login")
    if (session && (!session.user.twoFactorEnabled || session.twoFactorVerified)) {
        redirect("/dashboard/alias")
    }

    return (
        <div className="container relative min-h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-1 lg:px-0 bg-background">
            <LogoutButton />
            <div className="lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[440px] p-8 sm:p-10 rounded-2xl border border-border/40 bg-card shadow-xl shadow-primary/5">
                    <div className="flex flex-col space-y-2 text-center">
                        <h1 className="text-2xl font-serif">
                            Two-Factor Authentication
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Enter the 6-digit code from your authenticator app
                        </p>
                    </div>
                    <TwoFactorVerifyForm />
                </div>
            </div>
        </div>
    )
}
