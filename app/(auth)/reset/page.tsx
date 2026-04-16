import { Suspense } from "react"
import type { Metadata } from "next"
import { ResetPasswordContent } from "./reset-password-content"

export const metadata: Metadata = {
    title: "Reset Password",
}

export default function ResetPasswordPage() {
    return (
        <Suspense>
            <ResetPasswordContent />
        </Suspense>
    )
}
