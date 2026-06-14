
import { prisma } from "@/lib/prisma"
import type { Domain } from "@prisma/client"
import { ownerWhere, type OwnerScope } from "@/lib/ownership"

export async function getDomainsByUserId(userId: string): Promise<Domain[]> {
    return await prisma.domain.findMany({
        where: { userId }
    })
}

/** Domains within an owner scope (personal: the user's; org: the org's). */
export async function getDomains(scope: OwnerScope): Promise<Domain[]> {
    return await prisma.domain.findMany({
        where: ownerWhere(scope)
    })
}
