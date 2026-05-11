import type { ReactNode } from "react"

// Auth pages receive a nonce-based strict CSP from proxy.ts. Keep this route
// group dynamic so Next.js can apply the per-request nonce to its scripts.
export const dynamic = "force-dynamic"

export default function AuthLayout({ children }: { children: ReactNode }) {
    return <>{children}</>
}
