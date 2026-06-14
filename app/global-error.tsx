"use client"

import { useEffect } from "react"
import { createLogger } from "@/lib/logger"

const logger = createLogger("RootError")

/**
 * Root error boundary. Unlike the segment-level error.tsx files, this catches
 * errors thrown by the ROOT layout itself, so it replaces the entire document
 * and must render its own <html>/<body>. It cannot assume the app's providers,
 * fonts, or global CSS loaded (the layout may be exactly what failed), so the
 * fallback is intentionally self-contained with inline styles.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        logger.error("Unhandled root-layout error", error)
    }, [error])

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#0a0a0a",
                    color: "#fafafa",
                    fontFamily:
                        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
                    padding: "1.5rem",
                }}
            >
                <div style={{ maxWidth: "28rem", textAlign: "center" }}>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 500, marginBottom: "0.5rem" }}>
                        Something went wrong
                    </h1>
                    <p style={{ color: "#a1a1aa", lineHeight: 1.5, marginBottom: "1.5rem" }}>
                        An unexpected error occurred. Please try again in a moment.
                    </p>
                    {error.digest && (
                        <p
                            style={{
                                fontSize: "0.75rem",
                                color: "#71717a",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                marginBottom: "1.5rem",
                            }}
                        >
                            Error ID: {error.digest}
                        </p>
                    )}
                    <button
                        onClick={() => reset()}
                        style={{
                            cursor: "pointer",
                            border: "1px solid #3f3f46",
                            backgroundColor: "#fafafa",
                            color: "#0a0a0a",
                            borderRadius: "0.5rem",
                            padding: "0.5rem 1rem",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    )
}
