-- Prevent a plan lapse from immediately purging Form responses under the
-- shorter fallback retention window before administrators can react.
ALTER TABLE "organizations"
    ADD COLUMN "form_retention_grace_until" TIMESTAMP(3);

-- Existing lapsed workspaces may still contain responses created under paid
-- retention. Give administrators the same warning window as a newly observed
-- subscription loss instead of applying Free retention immediately at deploy.
UPDATE "organizations" AS organization
SET "form_retention_grace_until" = CURRENT_TIMESTAMP + INTERVAL '3 days'
WHERE NOT EXISTS (
    SELECT 1
    FROM "subscriptions" AS subscription
    WHERE subscription."organizationId" = organization."id"
      AND subscription."product" IN ('form', 'bundle', 'business')
      AND subscription."status" IN ('active', 'trialing')
      AND (
          subscription."currentPeriodEnd" IS NULL
          OR subscription."currentPeriodEnd" + INTERVAL '1 day' > CURRENT_TIMESTAMP
      )
);

-- Personal billing already uses users.downgraded_at for the 7+7 day deletion
-- grace. Backfill the marker only for previously paying users who actually have
-- Form responses and no currently entitling personal subscription.
UPDATE "users" AS owner
SET "downgraded_at" = CURRENT_TIMESTAMP
WHERE owner."downgraded_at" IS NULL
  AND EXISTS (
      SELECT 1
      FROM "forms" AS form
      JOIN "form_submissions" AS submission ON submission."formId" = form."id"
      WHERE form."userId" = owner."id"
        AND form."organizationId" IS NULL
  )
  AND EXISTS (
      SELECT 1
      FROM "subscriptions" AS historical
      WHERE historical."userId" = owner."id"
        AND historical."organizationId" IS NULL
        AND historical."product" IN ('form', 'bundle', 'business')
  )
  AND NOT EXISTS (
      SELECT 1
      FROM "subscriptions" AS current_subscription
      WHERE current_subscription."userId" = owner."id"
        AND current_subscription."organizationId" IS NULL
        AND current_subscription."product" IN ('form', 'bundle', 'business')
        AND current_subscription."status" IN ('active', 'trialing')
        AND (
            current_subscription."currentPeriodEnd" IS NULL
            OR current_subscription."currentPeriodEnd" + INTERVAL '1 day' > CURRENT_TIMESTAMP
        )
  );
