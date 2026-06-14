import { Prisma } from "@prisma/client"
import type { OwnerKeyOrgBinding } from "@/lib/vault/drop-owner-keys"

export type { OwnerKeyOrgBinding } from "@/lib/vault/drop-owner-keys"

type FormOwnerKeyUpdateManyArgs = {
    where: { formId: string; userId: string }
    data: { wrappedKey: string; vaultGeneration: number; organizationId?: string | null; orgKeyGeneration?: number | null }
}

type FormOwnerKeyCreateArgs = {
    data: { userId: string; formId: string; wrappedKey: string; vaultGeneration: number; organizationId?: string | null; orgKeyGeneration?: number | null }
}

type FormOwnerKeyFindUniqueArgs = {
    where: { formId: string }
    select: { userId: true }
}

type FormOwnerKeyWriteClient = {
    formOwnerKey: {
        updateMany(args: FormOwnerKeyUpdateManyArgs): PromiseLike<{ count: number }>
        create(args: FormOwnerKeyCreateArgs): PromiseLike<unknown>
        findUnique(args: FormOwnerKeyFindUniqueArgs): PromiseLike<{ userId?: unknown } | null>
    }
}

export class FormOwnerKeyConflictError extends Error {
    constructor() {
        super("Form key not found")
        this.name = "FormOwnerKeyConflictError"
    }
}

export async function persistOwnedFormKey(
    client: FormOwnerKeyWriteClient,
    userId: string,
    formId: string,
    wrappedKey: string,
    vaultGeneration: number,
    org?: OwnerKeyOrgBinding,
): Promise<void> {
    const orgData = org
        ? { organizationId: org.organizationId, orgKeyGeneration: org.orgKeyGeneration }
        : {}

    const updated = await client.formOwnerKey.updateMany({
        where: { formId, userId },
        data: { wrappedKey, vaultGeneration, ...orgData },
    })

    if (updated.count > 0) {
        return
    }

    try {
        await client.formOwnerKey.create({
            data: {
                userId,
                formId,
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

    const existing = await client.formOwnerKey.findUnique({
        where: { formId },
        select: { userId: true },
    })

    if (!existing || existing.userId !== userId) {
        throw new FormOwnerKeyConflictError()
    }

    await client.formOwnerKey.updateMany({
        where: { formId, userId },
        data: { wrappedKey, vaultGeneration },
    })
}
