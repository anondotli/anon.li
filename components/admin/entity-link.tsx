import Link from "next/link"
import { cn } from "@/lib/utils"

interface EntityLinkProps {
    type: "user" | "drop" | "alias" | "domain" | "recipient"
    id: string
    label?: string
    className?: string
}

const typeToPath: Record<EntityLinkProps["type"], string> = {
    user: "/admin/users",
    drop: "/admin/drops",
    alias: "/admin/aliases",
    domain: "/admin/domains",
    recipient: "/admin/recipients",
}

function EntityLink({ type, id, label, className }: EntityLinkProps) {
    const basePath = typeToPath[type]
    const href = `${basePath}/${id}`
    const displayLabel = label || id

    return (
        <Link
            href={href}
            className={cn(
                "text-primary hover:underline font-medium",
                className
            )}
        >
            {displayLabel}
        </Link>
    )
}

interface UserLinkProps {
    user: {
        id: string
        email?: string | null
        name?: string | null
    } | null
    className?: string
}

export function UserLink({ user, className }: UserLinkProps) {
    if (!user) {
        return <span className="text-muted-foreground">-</span>
    }

    return (
        <EntityLink
            type="user"
            id={user.id}
            label={user.email || user.name || user.id}
            className={className}
        />
    )
}
