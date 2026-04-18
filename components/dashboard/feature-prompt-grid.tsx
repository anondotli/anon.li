"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
    Code2,
    Fingerprint,
    FileKey,
    Globe,
    Key,
    KeyRound,
    Link2Off,
    Puzzle,
    QrCode,
    Shield,
    Terminal,
    Users,
    X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getFeaturesByIds } from "@/config/features"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
    alias_recipients: Users,
    alias_custom_domains: Globe,
    alias_pgp_forwarding: Key,
    alias_encrypted_metadata: Fingerprint,
    developer_rest_api: Code2,
    developer_cli: Terminal,
    developer_extension: Puzzle,
    developer_mcp: Shield,
    drop_password_protection: KeyRound,
    drop_expiry_download_limits: FileKey,
    drop_link_controls: Link2Off,
    drop_qr_sharing: QrCode,
}

interface FeaturePromptGridProps {
    title: string
    description: string
    featureIds: readonly string[]
    className?: string
    dismissStorageKey?: string
}

export function FeaturePromptGrid({
    title,
    description,
    featureIds,
    className,
    dismissStorageKey,
}: FeaturePromptGridProps) {
    const [isDismissed, setIsDismissed] = useState(Boolean(dismissStorageKey))
    const features = getFeaturesByIds(featureIds)

    useEffect(() => {
        if (!dismissStorageKey) return
        const timer = window.setTimeout(() => {
            setIsDismissed(localStorage.getItem(dismissStorageKey) === "true")
        }, 0)
        return () => window.clearTimeout(timer)
    }, [dismissStorageKey])

    const dismiss = () => {
        if (dismissStorageKey) {
            localStorage.setItem(dismissStorageKey, "true")
        }
        setIsDismissed(true)
    }

    if (features.length === 0) return null
    if (isDismissed) return null

    return (
        <section className={cn("relative rounded-xl border border-border/40 bg-secondary/20 p-4 sm:p-5", className)}>
            {dismissStorageKey && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-3 top-3 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={dismiss}
                    aria-label={`Dismiss ${title}`}
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
            <div className={cn("mb-4", dismissStorageKey && "pr-8")}>
                <h3 className="font-serif text-lg font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {features.map((feature) => {
                    const Icon = ICONS[feature.id] ?? Shield
                    return (
                        <Link
                            key={feature.id}
                            href={feature.href}
                            className="group rounded-lg border border-border/40 bg-background p-3 transition-colors hover:border-primary/20 hover:bg-primary/5"
                        >
                            <div className="mb-2 flex items-center gap-2">
                                <Icon className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium group-hover:text-primary">{feature.shortTitle}</span>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}
