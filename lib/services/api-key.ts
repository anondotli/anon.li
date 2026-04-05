import crypto from "crypto"
import { createApiKeyRecord, deleteApiKeyById, getApiKeyById } from "@/lib/data/api-key"
import { getUserById } from "@/lib/data/user"
import { enforceMonthlyQuota } from "@/lib/api-rate-limit"
import { NotFoundError } from "@/lib/api-error-utils"

export class ApiKeyService {

    static hashKey(key: string): string {
        return crypto.createHash("sha256").update(key).digest("hex")
    }

    static async create(userId: string, label: string) {
        const apiKey = await this.createWithMetadata(userId, label)
        return apiKey.key
    }

    static async createWithMetadata(userId: string, label: string, expiresAt?: Date) {
        const user = await getUserById(userId)
        if (!user) throw new NotFoundError("User not found")

        await enforceMonthlyQuota(userId, "alias", user)

        // No key count limit - API requests are rate limited instead

        // Generate
        const key = "ak_" + crypto.randomBytes(16).toString("hex")
        const keyHash = this.hashKey(key)
        const keyPrefix = key.slice(0, 11)

        const apiKey = await createApiKeyRecord({
            userId,
            keyHash,
            keyPrefix,
            label: label || "My API Key",
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

    static async delete(userId: string, keyId: string) {
        const apiKey = await getApiKeyById(keyId)
        if (!apiKey || apiKey.userId !== userId) {
            throw new NotFoundError("API key not found")
        }
        await deleteApiKeyById(keyId)
    }
}
