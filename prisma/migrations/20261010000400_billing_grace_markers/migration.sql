-- Track which drops received a billing-loss grace expiry so a recovered
-- subscription can restore them to unlimited instead of letting drop cleanup
-- hard-delete a paying customer's files.
ALTER TABLE "drops"
    ADD COLUMN "billing_grace_expires_at" TIMESTAMP(3);

-- Dedupe subscription-loss notifications across dunning retries and the
-- updated/deleted webhook events for the same lost subscription.
ALTER TABLE "subscriptions"
    ADD COLUMN "loss_notified_at" TIMESTAMP(3);
