import crypto from "crypto"
import { createApiKeyRecord, deleteApiKeyById, getApiKeyById } from "@/lib/data/api-key"
import { getUserById } from "@/lib/data/user"
import { NotFoundError } from "@/lib/api-error-utils"
import { assertCanAccess, type OwnerScope } from "@/lib/ownership"

export class ApiKeyService {

    static hashKey(key: string): string {
        return crypto.createHash("sha256").update(key).digest("hex")
    }

    static async create(scope: OwnerScope, label: string) {
        const apiKey = await this.createWithMetadata(scope, label)
        return apiKey.key
    }

    static async createWithMetadata(scope: OwnerScope, label: string, expiresAt?: Date) {
        const user = await getUserById(scope.userId)
        if (!user) throw new NotFoundError("User not found")

        const normalizedLabel = label.trim() || "My API Key"

        // No key count limit - API requests are rate limited instead

        // Generate
        const key = "ak_" + crypto.randomBytes(16).toString("hex")
        const keyHash = this.hashKey(key)
        const keyPrefix = key.slice(0, 11)

        // Key belongs to the active org when one is in context, else the user.
        const apiKey = await createApiKeyRecord({
            userId: scope.userId,
            organizationId: scope.organizationId,
            keyHash,
            keyPrefix,
            label: normalizedLabel,
            expiresAt: expiresAt ?? null,
        })

        return {
            id: apiKey.id,
            key,
            keyPrefix: apiKey.keyPrefix,
            label: apiKey.label,
            createdAt: apiKey.createdAt,
            expiresAt: apiKey.expiresAt,
        }
    }

    static async delete(scope: OwnerScope, keyId: string) {
        const apiKey = await getApiKeyById(keyId)
        if (!apiKey) {
            throw new NotFoundError("API key not found")
        }
        // Cross-tenant guard: the key must be within the caller's scope.
        assertCanAccess(apiKey, scope)
        await deleteApiKeyById(keyId)
    }
}
