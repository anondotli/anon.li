import { prisma } from "@/lib/prisma"
import { ownerWhere, type OwnerScope } from "@/lib/ownership"

export async function getApiKeys(scope: OwnerScope) {
    return await prisma.apiKey.findMany({
        where: ownerWhere(scope),
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            keyPrefix: true,
            label: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
        },
    })
}

export async function createApiKeyRecord(data: {
    userId: string
    organizationId: string | null
    keyHash: string
    keyPrefix: string
    label: string | null
    expiresAt: Date | null
}) {
    return await prisma.apiKey.create({
        data,
        select: {
            id: true,
            keyPrefix: true,
            label: true,
            createdAt: true,
            expiresAt: true,
        },
    })
}

export async function getApiKeyById(id: string) {
    return await prisma.apiKey.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            organizationId: true,
        },
    })
}

export async function deleteApiKeyById(id: string) {
    return await prisma.apiKey.delete({
        where: { id },
    })
}
