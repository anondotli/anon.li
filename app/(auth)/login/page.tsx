import { Suspense } from "react"
import { LoginPageContent } from "./login-content"

export const metadata = {
    title: "Login",
    description: "Login to your account",
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginPageContent />
        </Suspense>
    )
}
