import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { LoginPageContent } from "./login-content"

export const metadata = {
    title: "Login",
    description: "Login to your account",
}

export default async function LoginPage() {
    const session = await auth()
    if (session) redirect("/dashboard/alias")

    return (
        <Suspense fallback={null}>
            <LoginPageContent />
        </Suspense>
    )
}
