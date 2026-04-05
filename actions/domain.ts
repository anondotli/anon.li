"use server"

import { revalidatePath } from "next/cache"
import { DomainService } from "@/lib/services/domain"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { runSecureAction, type ActionState } from "@/lib/safe-action"

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

    return runSecureAction(
        { rateLimitKey: "domainOps" },
        async (_data, userId) => {
            await DomainService.createDomain(userId, domain)
            revalidatePath("/dashboard/alias/domains")
        }
    )
}

export async function verifyDomainAction(domainId: string): Promise<ActionState<VerifyResult>> {
    return runSecureAction<void, VerifyResult>(
        { rateLimitKey: "domainOps" },
        async (_data, userId) => {
            const result = await DomainService.verifyDomain(userId, domainId)
            revalidatePath("/dashboard/alias/domains")
            return result
        }
    )
}

export async function regenerateDkimAction(domainId: string): Promise<ActionState> {
    return runSecureAction(
        { rateLimitKey: "domainOps" },
        async (_data, userId) => {
            await DomainService.regenerateDkim(userId, domainId)
            revalidatePath("/dashboard/alias/domains")
        }
    )
}

export async function deleteDomainAction(domainId: string): Promise<ActionState> {
    return runSecureAction(
        { rateLimitKey: "domainOps" },
        async (_data, userId) => {
            await DomainService.deleteDomain(userId, domainId)
            revalidatePath("/dashboard/alias/domains")
        }
    )
}

