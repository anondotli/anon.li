import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type IconInputProps = React.ComponentProps<typeof Input> & {
    /** Leading icon rendered inside the field. */
    icon: LucideIcon
}

/**
 * Text input with a leading icon affordance — the non-password counterpart to
 * VaultPasswordInput, used for email and similar fields on the auth screens.
 */
export const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
    function IconInput({ icon: Icon, className, ...props }, ref) {
        return (
            <div className="relative">
                <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input ref={ref} className={cn("pl-10", className)} {...props} />
            </div>
        )
    },
)
