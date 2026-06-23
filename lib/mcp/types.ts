import type { SubscriptionLike } from "@/lib/limits"

export interface McpSession {
    userId: string
    clientId: string
    /** Space-separated OAuth scopes granted to the bearer token (enforced per-tool). */
    scopes?: string
}

export interface McpUser {
    id: string
    subscriptions: SubscriptionLike[]
}
