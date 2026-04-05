"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createLogger } from "@/lib/logger"

const logger = createLogger("DomainsError")

export default function Error({
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
        <div className="flex min-h-[40vh] flex-col items-center justify-center px-4">
            <div className="text-center space-y-6 max-w-md">
                <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-medium">Failed to load domains</h2>
                    <p className="text-sm text-muted-foreground">
                        Something went wrong loading this section. Please try again.
                    </p>
                </div>

                <div className="flex gap-3 justify-center">
                    <Button onClick={reset} size="sm" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                        <Link href="/dashboard/alias">
                            <ArrowLeft className="h-4 w-4" />
                            Dashboard
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
