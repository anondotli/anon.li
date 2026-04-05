
import { prisma } from "@/lib/prisma"
import type { Alias, User } from "@prisma/client"

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

export async function getAliasesByUserId(userId: string): Promise<Alias[]> {
    return await prisma.alias.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    })
}

export async function deleteAliasById(id: string, userId: string) {
    return await prisma.alias.deleteMany({
        where: { id, userId }
    })
}

export async function getAliasById(id: string, userId: string): Promise<Alias | null> {
    return await prisma.alias.findFirst({
        where: { id, userId }
    })
}
