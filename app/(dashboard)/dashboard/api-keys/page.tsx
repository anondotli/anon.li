import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Key } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

import { CreateApiKeyForm } from "./create-api-key-form"
import { ApiKeyList } from "./api-key-list"
import { ApiUsageCard } from "@/components/dashboard"

export default async function ApiKeysPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const apiKeys = await prisma.apiKey.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            keyPrefix: true,
            label: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
        },
    })

    return (
        <div className="space-y-8">
            <div className="border-b border-border/40 pb-6">
                <h3 className="text-3xl font-medium tracking-tight font-serif">API Keys</h3>
                <p className="text-sm text-muted-foreground font-light">
                    Manage your API keys for programmatic access.
                </p>
            </div>

            <div className="grid gap-8">
                <ApiUsageCard variant="compact" />

                <Card className="rounded-3xl border-border/40 shadow-sm">
                    <CardHeader className="p-8 pb-4">
                        <CardTitle className="text-xl font-medium font-serif">Your API Keys</CardTitle>
                        <CardDescription>
                            These keys allow full access to your account via the API. Keep them secure.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 p-8 pt-4">
                        <CreateApiKeyForm />

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
