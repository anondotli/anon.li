import { verifyRecipientByTokenAction } from "@/actions/recipient-verification"
import { VerifyRecipientChallenge } from "./verify-recipient-challenge"
import { VerifyRecipientResultCard } from "./verify-recipient-result"

interface VerifyRecipientPageProps {
    searchParams: Promise<{ token?: string }>
}

export default async function VerifyRecipientPage({ searchParams }: VerifyRecipientPageProps) {
    const { token } = await searchParams

    if (!token) {
        return (
            <div className="container flex min-h-screen items-center justify-center">
                <VerifyRecipientResultCard result={{ status: "missing-token" }} />
            </div>
        )
    }

    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    if (turnstileSiteKey) {
        return (
            <div className="container flex min-h-screen items-center justify-center">
                <VerifyRecipientChallenge token={token} siteKey={turnstileSiteKey} />
            </div>
        )
    }

    const result = await verifyRecipientByTokenAction(token)

    return (
        <div className="container flex min-h-screen items-center justify-center">
            <VerifyRecipientResultCard result={result} />
        </div>
    )
}
