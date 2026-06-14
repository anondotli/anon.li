import { Prisma } from "@prisma/client"

/**
 * Org shared-E2EE: when set, the wrappedKey is wrapped to the ORG vault key
 * (not the creator's personal vault key) and any member who can recover the org
 * vault key can open the resource. `null`/absent = a personal owner key.
 */
export type OwnerKeyOrgBinding = { organizationId: string; orgKeyGeneration: number }

type DropOwnerKeyUpdateManyArgs = {
    where: { dropId: string; userId: string }
    data: { wrappedKey: string; vaultGeneration: number; organizationId?: string | null; orgKeyGeneration?: number | null }
}

type DropOwnerKeyCreateArgs = {
    data: { userId: string; dropId: string; wrappedKey: string; vaultGeneration: number; organizationId?: string | null; orgKeyGeneration?: number | null }
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
    org?: OwnerKeyOrgBinding,
): Promise<void> {
    const orgData = org
        ? { organizationId: org.organizationId, orgKeyGeneration: org.orgKeyGeneration }
        : {}

    const updated = await client.dropOwnerKey.updateMany({
        where: { dropId, userId },
        data: { wrappedKey, vaultGeneration, ...orgData },
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
                ...orgData,
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
