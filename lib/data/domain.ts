
import { prisma } from "@/lib/prisma"
import type { Domain } from "@prisma/client"
import { ownerWhere, type OwnerScope } from "@/lib/ownership"

/** Domains within an owner scope (personal: the user's; org: the org's). */
export async function getDomains(scope: OwnerScope): Promise<Domain[]> {
    return await prisma.domain.findMany({
        where: ownerWhere(scope)
    })
}
