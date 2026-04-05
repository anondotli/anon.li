"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
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

const logger = createLogger("DropUploadError");

export default function DropUploadError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        logger.error("Error during file drop upload/encryption", error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center py-12 px-4 sm:px-6">
            <Card className="max-w-md w-full shadow-lg border-red-100 bg-white">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto bg-red-100 text-red-600 rounded-full p-3 w-16 h-16 flex items-center justify-center mb-2">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-2xl text-red-700">Upload Failed</CardTitle>
                    <CardDescription className="text-base text-zinc-600">
                        An error occurred during file encryption or upload.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive" className="bg-red-50 border border-red-200">
                        <AlertTitle>Error Message</AlertTitle>
                        <AlertDescription className="mt-2 text-sm text-red-800 break-words">
                            {error.message || "Network error or encryption failure occurred."}
                        </AlertDescription>
                    </Alert>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4 pt-4">
                    <Button
                        onClick={() => reset()}
                        className="w-full flex items-center justify-center gap-2"
                        size="lg"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Try Again
                    </Button>
                    <Button variant="outline" asChild className="w-full">
                        <Link href="/dashboard/alias">Return to Dashboard</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}