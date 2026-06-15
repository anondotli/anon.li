"use client"

import * as React from "react"
import { Eye, EyeOff, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type VaultPasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
    /** Paints the field in the destructive palette. */
    invalid?: boolean
    /** Paints the field in the success palette. */
    valid?: boolean
}

/**
 * Password field used across the vault auth screens: a lock affordance on the
 * left and a show/hide toggle on the right, matching the unlock prompt.
 */
export const VaultPasswordInput = React.forwardRef<HTMLInputElement, VaultPasswordInputProps>(
    function VaultPasswordInput({ className, invalid, valid, disabled, ...props }, ref) {
        const [show, setShow] = React.useState(false)

        return (
            <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={ref}
                    type={show ? "text" : "password"}
                    disabled={disabled}
                    className={cn(
                        "h-14 rounded-xl pl-10 pr-11 text-base transition-colors duration-200 md:h-12 md:text-sm",
                        invalid && "border-destructive text-destructive focus-visible:ring-destructive",
                        valid && "border-success text-success focus-visible:ring-success",
                        className,
                    )}
                    {...props}
                />
                <button
                    type="button"
                    onClick={() => setShow((prev) => !prev)}
                    disabled={disabled}
                    tabIndex={-1}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            </div>
        )
    },
)
