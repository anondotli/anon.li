"use client"

import * as React from "react"
import { Button, ButtonProps } from "@/components/ui/button"
import { AuthDialog } from "@/components/auth"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { User } from "@/types/auth"

interface HomeCTAProps {
    user: User | null | undefined
    children?: React.ReactNode
    variant?: ButtonProps["variant"]
    size?: ButtonProps["size"]
    className?: string
}

export function HomeCTA({ user, children, variant = "default", size = "default", className }: HomeCTAProps) {
    const [open, setOpen] = React.useState(false)

    if (user) {
        return (
            <Button asChild variant={variant} size={size} className={className}>
                <Link href="/dashboard/alias">
                    Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
            </Button>
        )
    }

    return (
        <>
            <Button onClick={() => setOpen(true)} variant={variant} size={size} className={className}>
                {children}
            </Button>
            <AuthDialog
                open={open}
                onOpenChange={setOpen}
                description="Enter your email to continue to your dashboard."
            />
        </>
    )
}
