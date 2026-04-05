"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCcw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import { createLogger } from "@/lib/logger";

const logger = createLogger("BillingError");

export default function BillingError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error using our unified logger
        logger.error("BillingPageError", "Error in billing dashboard", error);
    }, [error]);

    return (
        <div className="flex h-[80vh] w-full flex-col items-center justify-center">
            <Card className="mx-auto max-w-md w-full shadow-lg border-red-100">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto bg-red-100 text-red-600 rounded-full p-3 w-16 h-16 flex items-center justify-center mb-2">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-2xl text-red-700">Billing Error</CardTitle>
                    <CardDescription className="text-base text-zinc-600">
                        We encountered an issue loading your subscription details.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
                        <AlertTitle>Details</AlertTitle>
                        <AlertDescription className="mt-2 text-sm break-words whitespace-pre-wrap">
                            {error.message || "An unexpected error occurred while communicating with the payment provider."}
                        </AlertDescription>
                    </Alert>
                </CardContent>
                <CardFooter className="flex flex-col space-y-3 pt-6">
                    <Button
                        onClick={() => reset()}
                        className="w-full font-semibold gap-2"
                        size="lg"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Try Again
                    </Button>
                    <Button asChild variant="outline" className="w-full gap-2">
                        <Link href="/dashboard/alias">
                            <ArrowLeft className="w-4 h-4" />
                            Return to Dashboard
                        </Link>
                    </Button>
                    <p className="text-sm text-center text-zinc-500 pt-2">
                        If the problem persists, please contact support. You will not be charged for failed load attempts.
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
