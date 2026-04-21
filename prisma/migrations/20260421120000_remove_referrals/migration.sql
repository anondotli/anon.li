ALTER TABLE "users"
    DROP CONSTRAINT IF EXISTS "users_referred_by_user_id_fkey";

DROP INDEX IF EXISTS "users_referral_code_key";

ALTER TABLE "users"
    DROP COLUMN IF EXISTS "referral_code",
    DROP COLUMN IF EXISTS "referred_by_user_id";
