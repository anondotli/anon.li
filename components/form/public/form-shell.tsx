import Link from "next/link"
import { Shield } from "lucide-react"
import { Icons } from "@/components/shared/icons"
import { cn } from "@/lib/utils"

interface Props {
    children: React.ReactNode
    showBranding: boolean
    showFooter?: boolean
    className?: string
}

export function FormShell({ children, showBranding, showFooter = true, className }: Props) {
    return (
        <div className={cn("relative flex min-h-svh flex-col bg-background", className)}>
            <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
                <div className="absolute inset-0 bg-gradient-to-b from-secondary/30 via-transparent to-secondary/20" />
            </div>

            {showBranding ? (
                <Link
                    href="/"
                    prefetch={false}
                    className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-1.5 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground sm:left-6 sm:top-6"
                >
                    <Icons.logo className="h-4 w-4" />
                    <span className="font-serif text-base">anon.li</span>
                </Link>
            ) : null}

            <main className="flex flex-1 flex-col px-4 sm:px-6">{children}</main>

            {showBranding && showFooter ? (
                <footer className="px-6 pb-6 pt-3 text-center">
                    <p className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        encrypted with <Shield className="h-3 w-3" /> AES-256-GCM · powered by{" "}
                        <Link href="/" prefetch={false} className="underline-offset-2 transition-colors hover:text-foreground hover:underline">
                            anon.li
                        </Link>
                    </p>
                </footer>
            ) : null}
        </div>
    )
}
