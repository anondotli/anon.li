"use server"

import { revalidatePath } from "next/cache"
import { DomainService } from "@/lib/services/domain"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { runScopedAction, type ActionState } from "@/lib/safe-action"

interface VerifyResult {
    verified: boolean
    ownershipVerified: boolean
    mxVerified: boolean
    spfVerified: boolean
    dkimVerified: boolean
    dnsVerified: boolean
}

export async function addDomainAction(domain: string): Promise<ActionState> {
    // Additional IP-based rate limit for domain squatting protection
    const clientIp = await getClientIp()
    const ipLimited = await rateLimit("domainCreate", clientIp)
    if (ipLimited) {
        return { error: "Too many requests. Please try again later." }
    }

    return runScopedAction(
        { rateLimitKey: "domainOps" },
        async (_data, scope) => {
            await DomainService.createDomain(scope, domain)
            revalidatePath("/dashboard/alias/domains")
        }
    )
}

export async function verifyDomainAction(domainId: string): Promise<ActionState<VerifyResult>> {
    return runScopedAction<void, VerifyResult>(
        { rateLimitKey: "domainOps" },
        async (_data, scope) => {
            const result = await DomainService.verifyDomain(scope, domainId)
            revalidatePath("/dashboard/alias/domains")
            return result
        }
    )
}

export async function regenerateDkimAction(domainId: string): Promise<ActionState> {
    return runScopedAction(
        { rateLimitKey: "domainOps" },
        async (_data, scope) => {
            await DomainService.regenerateDkim(scope, domainId)
            revalidatePath("/dashboard/alias/domains")
        }
    )
}

export async function deleteDomainAction(domainId: string): Promise<ActionState> {
    return runScopedAction(
        { rateLimitKey: "domainOps" },
        async (_data, scope) => {
            await DomainService.deleteDomain(scope, domainId)
            revalidatePath("/dashboard/alias/domains")
        }
    )
}

