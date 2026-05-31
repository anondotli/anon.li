-- Referral program (v2). Codes are generated lazily on first visit to the invite
-- UI; referred_by is set once when a referred user verifies + claims. Plus rewards
-- are tracked via referral_plus_until (kept out of the subscriptions table on
-- purpose so they never collide with Stripe/crypto reconciliation).
ALTER TABLE "users"
    ADD COLUMN "referral_code" TEXT,
    ADD COLUMN "referred_by_user_id" TEXT,
    ADD COLUMN "referral_plus_until" TIMESTAMP(3),
    ADD COLUMN "referral_claimed_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

CREATE INDEX "users_referred_by_user_id_idx" ON "users"("referred_by_user_id");

ALTER TABLE "users"
    ADD CONSTRAINT "users_referred_by_user_id_fkey"
    FOREIGN KEY ("referred_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
