import { Prisma } from "@prisma/client"
import type { OwnerKeyOrgBinding } from "@/lib/vault/drop-owner-keys"

export type { OwnerKeyOrgBinding } from "@/lib/vault/drop-owner-keys"

type FormOwnerKeyUpdateManyArgs = {
    where:
        | { formId: string; userId: string; organizationId: null }
        | { formId: string; organizationId: string }
    data: { wrappedKey: string; vaultGeneration: number; organizationId?: string | null; orgKeyGeneration?: number | null }
}

type FormOwnerKeyCreateArgs = {
    data: { userId: string; formId: string; wrappedKey: string; vaultGeneration: number; organizationId?: string | null; orgKeyGeneration?: number | null }
}

type FormOwnerKeyFindUniqueArgs = {
    where: { formId: string }
    select: { userId: true; organizationId: true }
}

type FormOwnerKeyWriteClient = {
    formOwnerKey: {
        updateMany(args: FormOwnerKeyUpdateManyArgs): PromiseLike<{ count: number }>
        create(args: FormOwnerKeyCreateArgs): PromiseLike<unknown>
        findUnique(args: FormOwnerKeyFindUniqueArgs): PromiseLike<{
            userId?: unknown
            organizationId?: unknown
        } | null>
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
        : { organizationId: null, orgKeyGeneration: null }
    const scopeWhere = org
        ? { formId, organizationId: org.organizationId }
        : { formId, userId, organizationId: null as null }

    const updated = await client.formOwnerKey.updateMany({
        where: scopeWhere,
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
        select: { userId: true, organizationId: true },
    })

    const existingIsInScope = org
        ? existing?.organizationId === org.organizationId
        : existing?.userId === userId && existing.organizationId === null

    if (!existingIsInScope) {
        throw new FormOwnerKeyConflictError()
    }

    const retried = await client.formOwnerKey.updateMany({
        where: scopeWhere,
        data: { wrappedKey, vaultGeneration, ...orgData },
    })

    if (retried.count === 0) {
        throw new FormOwnerKeyConflictError()
    }
}
