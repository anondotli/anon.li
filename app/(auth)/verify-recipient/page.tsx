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

    return (
        <div className="container flex min-h-screen items-center justify-center">
            <VerifyRecipientChallenge token={token} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!} />
        </div>
    )
}
