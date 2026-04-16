"use client"

import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { signOutWithVaultCleanup } from "@/lib/vault/client"

export function LogoutButton() {
    return (
        <button
            onClick={() => {
                signOutWithVaultCleanup("2fa-logout")
            }}
            className={cn(
                buttonVariants({ variant: "ghost" }),
                "absolute left-4 top-4 md:left-8 md:top-8 font-serif hover:bg-transparent hover:text-primary transition-colors"
            )}
        >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Log out
        </button>
    )
}
