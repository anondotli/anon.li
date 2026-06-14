import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { FREE_TEAM_MEMBER_LIMIT } from "@/lib/org-seats"
import { TeamManagement } from "@/components/dashboard/team/team-management"

export const metadata = {
    title: "Team",
    description: "Manage your team's members, plan, and settings.",
}

export default async function TeamPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    // Plan facts come from the server — subscriptions aren't exposed through
    // authClient. Switching teams calls router.refresh(), which re-runs this
    // for the new active org.
    const orgId = session.activeOrganizationId
    const [subscription, organization] = orgId
        ? await Promise.all([
              prisma.subscription.findFirst({
                  where: {
                      organizationId: orgId,
                      status: { in: ["active", "trialing"] },
                      currentPeriodEnd: { gt: new Date() },
                  },
                  orderBy: { seats: "desc" },
                  select: { seats: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
              }),
              prisma.organization.findUnique({
                  where: { id: orgId },
                  select: { keyRotationRecommendedAt: true, enforce2FA: true, orgKeyGeneration: true },
              }),
          ])
        : [null, null]

    return (
        <TeamManagement
            currentUserId={session.user.id}
            plan={subscription}
            seatLimit={subscription ? Math.max(subscription.seats, 1) : FREE_TEAM_MEMBER_LIMIT}
            keyRotationRecommended={Boolean(organization?.keyRotationRecommendedAt)}
            enforce2FA={Boolean(organization?.enforce2FA)}
            keyGeneration={organization?.orgKeyGeneration ?? 0}
        />
    )
}
