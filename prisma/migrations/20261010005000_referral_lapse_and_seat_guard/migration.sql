-- Referral Plus lapse handling marker: the billing cron records a downgrade for
-- users whose complimentary referral Plus has lapsed (and who hold no other
-- entitling plan), then stamps this so the lapse is processed exactly once.
-- Every new referral grant clears it again.
ALTER TABLE "users" ADD COLUMN "referral_plus_lapse_handled_at" TIMESTAMP(3);

-- Seat guard: serialize member inserts per organization and reject any insert
-- that would exceed the org's seat limit. better-auth's accept-invitation
-- checks the member count OUTSIDE its insert transaction, so two concurrent
-- accepts could both pass the check and overfill a paid seat count. The row
-- lock on the organization makes concurrent inserts for the same org run one
-- at a time; each then counts the already-committed members.
--
-- The limit mirrors getOrgSeatLimit (lib/org-seats.ts) and the shared
-- entitling-subscription rule (lib/subscription-entitlement.ts): the largest
-- seat count among active/trialing org subscriptions whose period has not
-- lapsed past the one-day access grace (null period = manual grant), at least
-- 1; an org without one may hold exactly 1 member (its owner).
CREATE FUNCTION "enforce_org_seat_limit"()
RETURNS TRIGGER AS $$
DECLARE
    seat_limit INTEGER;
    member_count INTEGER;
BEGIN
    PERFORM 1 FROM "organizations" WHERE "id" = NEW."organizationId" FOR UPDATE;

    SELECT GREATEST(MAX("seats"), 1) INTO seat_limit
    FROM "subscriptions"
    WHERE "organizationId" = NEW."organizationId"
      AND "status" IN ('active', 'trialing')
      AND ("current_period_end" IS NULL OR "current_period_end" > now() - interval '1 day');

    IF seat_limit IS NULL THEN
        seat_limit := 1;
    END IF;

    SELECT COUNT(*) INTO member_count
    FROM "members"
    WHERE "organizationId" = NEW."organizationId";

    IF member_count >= seat_limit THEN
        RAISE EXCEPTION 'ORG_SEAT_LIMIT_REACHED: organization % has % of % seats in use',
            NEW."organizationId", member_count, seat_limit
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "members_enforce_org_seat_limit"
BEFORE INSERT ON "members"
FOR EACH ROW
EXECUTE FUNCTION "enforce_org_seat_limit"();
