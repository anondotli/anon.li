"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createLogger } from "@/lib/logger"

const logger = createLogger("FormError")

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
            <div className="max-w-md space-y-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-medium">Failed to load forms</h2>
                    <p className="text-sm text-muted-foreground">
                        Something went wrong loading this section. Please try again.
                    </p>
                </div>

                <div className="flex justify-center gap-3">
                    <Button onClick={reset} size="sm" className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                        <Link href="/dashboard">
                            <ArrowLeft className="h-4 w-4" />
                            Dashboard
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
