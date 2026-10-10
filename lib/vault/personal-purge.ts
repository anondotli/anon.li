import "server-only"
import { prisma } from "@/lib/prisma"

/**
 * Prisma operations that purge a user's PERSONAL vault-security rows: their
 * per-drop and per-form owner keys, the org vault keys sealed to their identity
 * public key, and their `userSecurity` row.
 *
 * Org-owned owner keys (`organizationId` set) are the ONLY copy of the key
 * sealed to the org vault key — they MUST survive the loss of any single
 * member's credentials or the team's org drops/forms become permanently
 * undecryptable (see the `DropOwnerKey` / `FormOwnerKey` model comments in
 * prisma/schema.prisma). They are therefore explicitly excluded via
 * `organizationId: null`.
 *
 * `organizationMemberKey` rows are per-member grants of the org vault key
 * sealed to the member's identity public key. That key lives (wrapped) on the
 * `userSecurity` row being deleted, so those grants can never be opened again;
 * dropping them makes the member show up as "pending" so an admin re-grants to
 * their next identity key instead of the stale grant counting as current.
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
        prisma.formOwnerKey.deleteMany({ where: { userId, organizationId: null } }),
        prisma.organizationMemberKey.deleteMany({ where: { userId } }),
        prisma.userSecurity.deleteMany({ where: { userId } }),
    ]
}
