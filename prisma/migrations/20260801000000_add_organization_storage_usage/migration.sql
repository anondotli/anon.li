ALTER TABLE "organizations"
ADD COLUMN "storageUsed" BIGINT NOT NULL DEFAULT 0;

-- Rebuild both counters from the authoritative DropFile reservations. This
-- moves existing organization-owned bytes out of their creators' personal
-- counters and also repairs any historical counter drift.
UPDATE "organizations" AS organization
SET "storageUsed" = usage.bytes
FROM (
    SELECT parent."organizationId", COALESCE(SUM(file."size"), 0)::bigint AS bytes
    FROM "drops" AS parent
    INNER JOIN "drop_files" AS file ON file."dropId" = parent."id"
    WHERE parent."organizationId" IS NOT NULL
    GROUP BY parent."organizationId"
) AS usage
WHERE organization."id" = usage."organizationId";

UPDATE "users" AS account
SET "storageUsed" = COALESCE(usage.bytes, 0)::bigint
FROM (
    SELECT
        account_id."id" AS "userId",
        SUM(file."size") FILTER (WHERE parent."organizationId" IS NULL) AS bytes
    FROM "users" AS account_id
    LEFT JOIN "drops" AS parent ON parent."userId" = account_id."id"
    LEFT JOIN "drop_files" AS file ON file."dropId" = parent."id"
    GROUP BY account_id."id"
) AS usage
WHERE account."id" = usage."userId";
