-- Team / Organizations production hardening (this is the schema half of the
-- B2B production-readiness work; the rest is application code).
--
-- 1. Organization.orgKeyGeneration / keyRotationRecommendedAt — the authoritative
--    shared-team-E2EE key generation (0 = unseeded) and the persistent
--    "rotation recommended after a member was removed" marker. Seed/rotate use a
--    conditional update on orgKeyGeneration as a single-winner lock.
-- 2. Subscription.userId → nullable + ON DELETE SET NULL — so deleting the
--    buyer's account does NOT cascade-delete an org-owned Business subscription
--    (it belongs to the organization, not the user).
-- 3. Drop the SSO policy columns (ssoOnly, allowedEmailDomains): SSO/SCIM was
--    never implemented, so storing flags that imply an unenforced guarantee is
--    removed rather than left as misleading dead config. enforce2FA is KEPT and
--    is now actually enforced (lib/access-policy.ts).
--
-- Guards make each statement idempotent/no-op where the target state already
-- holds, so this is safe to (re)apply across prod / staging / fresh databases.

-- 1 + 3. organizations: add key-generation columns, drop SSO columns.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "org_key_generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "key_rotation_recommended_at" TIMESTAMP(3);
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "ssoOnly";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "allowedEmailDomains";

-- 2. subscriptions.userId: nullable + SET NULL on user delete.
ALTER TABLE "subscriptions" ALTER COLUMN "userId" DROP NOT NULL;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_userId_fkey') THEN
        ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_userId_fkey";
    END IF;
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END
$$;
