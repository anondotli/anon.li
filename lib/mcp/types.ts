export interface McpSession {
    userId: string
    clientId: string
    scopes?: string
    accessToken?: string
}

export interface McpUser {
    id: string
    stripeSubscriptionId: string | null
    stripePriceId: string | null
    stripeCurrentPeriodEnd: Date | null
}
