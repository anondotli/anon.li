import Link from "next/link"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * Shown on the dashboard create pages (alias/drop/form/recipients) when the
 * active context is a team with no Business subscription. Purchase-first Teams:
 * an unsubscribed org is a zero-capacity workspace — the owner subscribes from
 * the Team page, or switches to Personal to manage their own resources. The
 * server (assertOrgPlanActive) is the hard guarantee; this is the matching UX.
 */
export function TeamWorkspaceLocked({ resource }: { resource: string }) {
    return (
        <EmptyState
            icon={Lock}
            title="Subscribe to unlock your team workspace"
            description={`Your team needs a Business subscription to create ${resource} here. Until then, switch to your Personal workspace from the header to create and manage your own.`}
            action={
                <Button asChild>
                    <Link href="/dashboard/team">Go to Team billing</Link>
                </Button>
            }
        />
    )
}
