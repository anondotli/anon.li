"use client"

import { Button } from "@/components/ui/button"
import { createPortalSession } from "@/actions/create-portal-session"
import { useTransition } from "react"
import { toast } from "sonner"
import { createLogger } from "@/lib/logger"

import { cn } from "@/lib/utils"

const logger = createLogger("ManageSubscription")

interface ManageSubscriptionButtonProps {
    label?: string
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    className?: string
}

export function ManageSubscriptionButton({
    label = "Manage Subscription",
    variant = "secondary",
    className
}: ManageSubscriptionButtonProps) {
    const [isPending, startTransition] = useTransition()

    const handleManage = () => {
        startTransition(async () => {
            try {
                const result = await createPortalSession()
                if (result?.status === "error") {
                    toast.error(result.message)
                }
            } catch (error) {
                logger.error("Unexpected error", error)
                toast.error("An unexpected error occurred")
            }
        })
    }

    return (
        <Button
            onClick={handleManage}
            disabled={isPending}
            variant={variant}
            className={cn(
                "rounded-full px-6",
                variant === "default" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "opacity-100 hover:bg-secondary/80",
                className
            )}
        >
            {isPending ? "Loading..." : label}
        </Button>
    )
}
