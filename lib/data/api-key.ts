import { prisma } from "@/lib/prisma"

export async function getApiKeysByUserId(userId: string) {
    return await prisma.apiKey.findMany({
        where: { userId },
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
        },
    })
}

export async function deleteApiKeyById(id: string) {
    return await prisma.apiKey.delete({
        where: { id },
    })
}