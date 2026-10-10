import type { ReactNode } from "react"

// Public Drop (/d) and Form (/f, /embed/f) pages receive a nonce-based strict
// CSP from proxy.ts. Keep this route group dynamic so Next.js applies the
// per-request nonce to its scripts — a cached render would carry a stale nonce
// and every script would be blocked.
export const dynamic = "force-dynamic"

export default function PublicLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
