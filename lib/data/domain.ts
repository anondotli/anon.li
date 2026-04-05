
import { prisma } from "@/lib/prisma"
import type { Domain } from "@prisma/client"

export async function getDomainsByUserId(userId: string): Promise<Domain[]> {
    return await prisma.domain.findMany({
        where: { userId }
    })
}
