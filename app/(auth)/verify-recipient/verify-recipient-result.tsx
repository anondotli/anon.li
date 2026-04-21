"use client"

import Link from "next/link"
import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { RecipientVerificationResult } from "@/actions/recipient-verification"

type VerifyRecipientDisplayResult =
    | { status: "missing-token" }
    | RecipientVerificationResult

export function VerifyRecipientResultCard({ result }: { result: VerifyRecipientDisplayResult }) {
    if (result.status === "missing-token") {
        return (
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
        )
    }

    if (result.status === "already-verified") {
        return (
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
        )
    }

    if (result.status === "success") {
        return (
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
        )
    }

    return (
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
    )
}
