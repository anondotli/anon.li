import type { SubscriptionLike } from "@/lib/limits"

export interface McpSession {
    userId: string
    clientId: string
    scopes?: string
    accessToken?: string
}

export interface McpUser {
    id: string
    subscriptions: SubscriptionLike[]
}
