import { Prisma } from "@prisma/client"

type DropOwnerKeyUpdateManyArgs = {
    where: { dropId: string; userId: string }
    data: { wrappedKey: string; vaultGeneration: number }
}

type DropOwnerKeyCreateArgs = {
    data: { userId: string; dropId: string; wrappedKey: string; vaultGeneration: number }
}

type DropOwnerKeyFindUniqueArgs = {
    where: { dropId: string }
    select: { userId: true }
}

type DropOwnerKeyWriteClient = {
    dropOwnerKey: {
        updateMany(args: DropOwnerKeyUpdateManyArgs): PromiseLike<{ count: number }>
        create(args: DropOwnerKeyCreateArgs): PromiseLike<unknown>
        findUnique(args: DropOwnerKeyFindUniqueArgs): PromiseLike<{ userId?: unknown } | null>
    }
}

export class DropOwnerKeyConflictError extends Error {
    constructor() {
        super("Drop key not found")
        this.name = "DropOwnerKeyConflictError"
    }
}

export async function persistOwnedDropKey(
    client: DropOwnerKeyWriteClient,
    userId: string,
    dropId: string,
    wrappedKey: string,
    vaultGeneration: number,
): Promise<void> {
    const updated = await client.dropOwnerKey.updateMany({
        where: { dropId, userId },
        data: { wrappedKey, vaultGeneration },
    })

    if (updated.count > 0) {
        return
    }

    try {
        await client.dropOwnerKey.create({
            data: {
                userId,
                dropId,
                wrappedKey,
                vaultGeneration,
            },
        })
        return
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
            throw error
        }
    }

    const existing = await client.dropOwnerKey.findUnique({
        where: { dropId },
        select: { userId: true },
    })

    if (!existing || existing.userId !== userId) {
        throw new DropOwnerKeyConflictError()
    }

    await client.dropOwnerKey.updateMany({
        where: { dropId, userId },
        data: { wrappedKey, vaultGeneration },
    })
}
