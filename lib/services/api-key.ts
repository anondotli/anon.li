import crypto from "crypto"
import { createApiKeyRecord, deleteApiKeyById, getApiKeyById } from "@/lib/data/api-key"
import { getUserById } from "@/lib/data/user"
import { ApiError, NotFoundError } from "@/lib/api-error-utils"
import { assertCanAccess, assertCanManage, isOrgScope, type OwnerScope } from "@/lib/ownership"
import { isOrgSubscribed } from "@/lib/data/auth"

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

        // Team keys require a paid team — the same gate the REST create route
        // applies via `organizationAccess: "subscribed"`, enforced here so the
        // dashboard action (and any other caller) cannot bypass it.
        if (isOrgScope(scope) && !(await isOrgSubscribed(scope.organizationId))) {
            throw new ApiError(
                "An active Business subscription is required for this organization.",
                402,
                "PAYMENT_REQUIRED",
            )
        }

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
        // Cross-tenant guard + org RBAC: revoking another member's org key is
        // admin+, but any member may revoke a key they created themselves.
        if (apiKey.userId === scope.userId) {
            assertCanAccess(apiKey, scope)
        } else {
            assertCanManage(apiKey, scope)
        }
        await deleteApiKeyById(keyId)
    }
}
