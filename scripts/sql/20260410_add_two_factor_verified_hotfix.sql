ALTER TABLE "two_factors"
ADD COLUMN IF NOT EXISTS "verified" BOOLEAN;

UPDATE "two_factors" AS tf
SET "verified" = COALESCE(u."twoFactorEnabled", false)
FROM "users" AS u
WHERE u."id" = tf."userId"
  AND tf."verified" IS NULL;

UPDATE "two_factors"
SET "verified" = false
WHERE "verified" IS NULL;

ALTER TABLE "two_factors"
ALTER COLUMN "verified" SET DEFAULT true;

ALTER TABLE "two_factors"
ALTER COLUMN "verified" SET NOT NULL;
