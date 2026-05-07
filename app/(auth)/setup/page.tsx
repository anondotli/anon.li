import { Suspense } from "react"
import { SetupPasswordPageContent } from "./setup-password-content"

export const metadata = {
    title: "Setup Password",
    description: "Finish configuring your encrypted vault",
}

export default function SetupPasswordPage() {
    return (
        <Suspense fallback={null}>
            <SetupPasswordPageContent />
        </Suspense>
    )
}
