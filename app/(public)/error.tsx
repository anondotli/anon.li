"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"
import { createLogger } from "@/lib/logger"

const logger = createLogger("PublicError")

export default function PublicError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        logger.error("Unhandled error", error)
    }, [error])

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
            <div className="text-center space-y-6 max-w-md">
                <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-serif font-medium">Something went wrong</h1>
                    <p className="text-muted-foreground">
                        An error occurred while loading this page. Please try again.
                    </p>
                </div>

                {error.digest && (
                    <p className="text-xs text-muted-foreground font-mono">
                        Error ID: {error.digest}
                    </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button onClick={reset} variant="default" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                        <Link href="/">
                            <Home className="h-4 w-4" />
                            Go home
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
