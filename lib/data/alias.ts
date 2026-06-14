
import { prisma } from "@/lib/prisma"
import type { Alias, User } from "@prisma/client"
import { ownerWhere, type OwnerScope } from "@/lib/ownership"

export async function getAliasByEmail(email: string): Promise<(Alias & { user: Pick<User, "id" | "banned"> | null }) | null> {
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

export async function getAliases(
    scope: OwnerScope,
    options: { limit?: number; offset?: number } = {},
): Promise<Alias[]> {
    const { limit, offset } = options
    return await prisma.alias.findMany({
        where: ownerWhere(scope),
        orderBy: { createdAt: "desc" },
        ...(limit !== undefined ? { take: limit } : {}),
        ...(offset !== undefined ? { skip: offset } : {}),
    })
}

export async function countAliases(scope: OwnerScope): Promise<number> {
    return await prisma.alias.count({ where: ownerWhere(scope) })
}

/**
 * Usage counts by alias format, computed in the database so callers don't have
 * to load every alias row just to count them (Pro users have unlimited random
 * aliases). Used by the dashboard usage bars.
 */
export async function countAliasesByFormat(
    scope: OwnerScope,
): Promise<{ random: number; custom: number; total: number }> {
    const grouped = await prisma.alias.groupBy({
        by: ["format"],
        where: ownerWhere(scope),
        _count: { _all: true },
    })

    let random = 0
    let custom = 0
    for (const row of grouped) {
        if (row.format === "RANDOM") random = row._count._all
        else if (row.format === "CUSTOM") custom = row._count._all
    }

    return { random, custom, total: random + custom }
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
