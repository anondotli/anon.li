-- Drop legacy Stripe columns from users now that the canonical Subscription
-- table is the source of truth. The unique-key indexes for stripe_customer_id
-- and stripe_subscription_id are dropped automatically with the columns.
ALTER TABLE "users"
    DROP COLUMN IF EXISTS "stripe_customer_id",
    DROP COLUMN IF EXISTS "stripe_subscription_id",
    DROP COLUMN IF EXISTS "stripe_price_id",
    DROP COLUMN IF EXISTS "stripe_current_period_end",
    DROP COLUMN IF EXISTS "stripe_cancel_at_period_end";
