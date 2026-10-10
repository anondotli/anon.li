"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// next-themes renders an inline <script>. Server HTML keeps it executable (its
// hash is pinned in the CSP); on the client React never runs it anyway, and a
// client-side render (error/not-found boundaries) logs "Encountered a script
// tag" unless the element is marked as a data block.
const scriptProps = typeof window === "undefined" ? undefined : { type: "application/json" }

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider scriptProps={scriptProps} {...props}>{children}</NextThemesProvider>
}
