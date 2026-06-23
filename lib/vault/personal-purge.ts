import "server-only"
import { prisma } from "@/lib/prisma"

/**
 * Prisma operations that purge a user's PERSONAL vault-security rows: their
 * per-drop owner keys and their `userSecurity` row.
 *
 * Org-owned owner keys (`organizationId` set) are the ONLY copy of the key
 * sealed to the org vault key — they MUST survive the loss of any single
 * member's credentials or the team's org drops become permanently undecryptable
 * (see the `DropOwnerKey` model comment in prisma/schema.prisma). They are
 * therefore explicitly excluded via `organizationId: null`.
 *
 * Returned as un-awaited Prisma operations so callers can splice them into a
 * single `$transaction` alongside their own deletes. This is the single source
 * of the "personal-only" invariant, shared by the password-reset hook
 * (lib/auth.ts) and account deletion (lib/services/deletion.ts) so the two
 * paths can never drift.
 */
export function purgePersonalVaultKeysOps(userId: string) {
    return [
        prisma.dropOwnerKey.deleteMany({ where: { userId, organizationId: null } }),
        prisma.userSecurity.deleteMany({ where: { userId } }),
    ]
}
