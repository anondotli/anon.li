
import { prisma } from "@/lib/prisma"
import type { Alias, User } from "@prisma/client"
import { ownerWhere, type OwnerScope } from "@/lib/ownership"

export async function getAliasByEmail(email: string): Promise<(Alias & { user: Pick<User, "id" | "banned"> }) | null> {
    return await prisma.alias.findUnique({
        where: { email },
        include: {
            user: {
                select: {
                    id: true,
                    banned: true
                }
            }
        }
    })
}

export async function getAliases(scope: OwnerScope): Promise<Alias[]> {
    return await prisma.alias.findMany({
        where: ownerWhere(scope),
        orderBy: { createdAt: "desc" },
    })
}

export async function deleteAliasById(id: string, scope: OwnerScope) {
    return await prisma.alias.deleteMany({
        where: { id, ...ownerWhere(scope) }
    })
}

export async function getAliasById(id: string, scope: OwnerScope): Promise<Alias | null> {
    return await prisma.alias.findFirst({
        where: { id, ...ownerWhere(scope) }
    })
}
