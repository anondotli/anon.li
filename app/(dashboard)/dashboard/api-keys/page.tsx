import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Key } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { scopeFromSession } from "@/lib/auth-session"
import { isOrgScope } from "@/lib/ownership"
import { getApiKeys } from "@/lib/data/api-key"
import { isOrgSubscribed } from "@/lib/data/auth"

import { CreateApiKeyForm } from "./create-api-key-form"
import { ApiKeyList } from "./api-key-list"
import { ApiUsageCard } from "@/components/dashboard"

export default async function ApiKeysPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    // List the keys of the ACTIVE scope — the same scope the create/delete
    // actions (runScopedAction) operate in — so a key created while a team is
    // active shows up here, and the page never lists keys the actions can't
    // reach. Personal context: the user's own keys; team context: the team's.
    const scope = scopeFromSession(session)
    const teamScope = isOrgScope(scope)
    const [apiKeys, organization, teamSubscribed] = await Promise.all([
        getApiKeys(scope),
        teamScope
            ? prisma.organization.findUnique({
                  where: { id: scope.organizationId },
                  select: { name: true },
              })
            : null,
        teamScope ? isOrgSubscribed(scope.organizationId) : true,
    ])
    const teamName = organization?.name ?? "your team"

    return (
        <div className="space-y-8">
            <div className="border-b border-border/40 pb-6">
                <h1 className="text-3xl font-medium tracking-tight font-serif">API Keys</h1>
                <p className="text-sm text-muted-foreground font-light">
                    Manage your API keys for programmatic access.
                </p>
            </div>

            <div className="grid gap-8">
                <ApiUsageCard variant="compact" />

                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-8 pb-4">
                        <CardTitle className="text-xl font-medium font-serif">
                            {teamScope ? `Team API Keys — ${teamName}` : "Your personal API Keys"}
                        </CardTitle>
                        <CardDescription>
                            {teamScope
                                ? `Keys created here belong to ${teamName}: they act on the team's resources and count against the team's API quota. Switch to your personal account to manage your own keys.`
                                : "These keys allow full access to your personal account via the API. Team keys are managed while the team is active. Keep them secure."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 p-8 pt-4">
                        {teamSubscribed ? (
                            <CreateApiKeyForm />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Team API keys require an active Business subscription. Subscribe from the Team page,
                                or switch to your personal account to create a personal key.
                            </p>
                        )}

                        <div className="mt-4 space-y-4">
                            {apiKeys.length === 0 ? (
                                <EmptyState
                                    icon={Key}
                                    title="No API keys yet"
                                    description="Create your first API key to access the API programmatically."
                                />
                            ) : (
                                <ApiKeyList apiKeys={apiKeys} />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
