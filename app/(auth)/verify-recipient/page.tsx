import { RecipientService } from "@/lib/services/recipient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Clock } from "lucide-react"
import Link from "next/link"

interface VerifyRecipientPageProps {
    searchParams: Promise<{ token?: string }>
}

type VerificationResult =
    | { status: "missing-token" }
    | { status: "already-verified"; email: string }
    | { status: "success"; email: string }
    | { status: "error"; message: string; isExpired: boolean }

export default async function VerifyRecipientPage({ searchParams }: VerifyRecipientPageProps) {
    const { token } = await searchParams

    let result: VerificationResult

    if (!token) {
        result = { status: "missing-token" }
    } else {
        try {
            const verifyResult = await RecipientService.verifyByToken(token)

            if (verifyResult.alreadyVerified) {
                result = { status: "already-verified", email: verifyResult.recipient.email }
            } else {
                result = { status: "success", email: verifyResult.recipient.email }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Verification failed"
            const isExpired = message.includes("expired")
            result = { status: "error", message, isExpired }
        }
    }

    if (result.status === "missing-token") {
        return (
            <div className="container flex min-h-screen items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <XCircle className="mx-auto h-12 w-12 text-destructive" />
                        <CardTitle className="mt-4">Invalid Link</CardTitle>
                        <CardDescription>
                            This verification link is invalid or missing.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Button asChild>
                            <Link href="/dashboard/alias">Go to Dashboard</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (result.status === "already-verified") {
        return (
            <div className="container flex min-h-screen items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
                        <CardTitle className="mt-4">Already Verified</CardTitle>
                        <CardDescription>
                            The email address <strong>{result.email}</strong> has already been verified.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Button asChild>
                            <Link href="/dashboard/alias/recipients">Manage Recipients</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (result.status === "success") {
        return (
            <div className="container flex min-h-screen items-center justify-center">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
                        <CardTitle className="mt-4">Email Verified!</CardTitle>
                        <CardDescription>
                            <strong>{result.email}</strong> has been verified and can now receive forwarded emails.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Button asChild>
                            <Link href="/dashboard/alias/recipients">Manage Recipients</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // result.status === "error"
    return (
        <div className="container flex min-h-screen items-center justify-center">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    {result.isExpired ? (
                        <Clock className="mx-auto h-12 w-12 text-amber-500" />
                    ) : (
                        <XCircle className="mx-auto h-12 w-12 text-destructive" />
                    )}
                    <CardTitle className="mt-4">
                        {result.isExpired ? "Link Expired" : "Verification Failed"}
                    </CardTitle>
                    <CardDescription>
                        {result.message}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center">
                    <Button asChild>
                        <Link href="/dashboard/alias/recipients">Go to Recipients</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
