-- Durable, content-free Form quota ledger. Usage must survive response/form
-- deletion; otherwise customers can reset monthly limits by deleting rows.
CREATE TABLE "form_usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_usage_events_pkey" PRIMARY KEY ("id")
);

-- Keep rolling deployments safe: old application instances do not know about
-- the ledger, so the database records every accepted response as well. The new
-- application uses an idempotent insert, making dual-writing harmless.
CREATE FUNCTION "record_form_usage_event"()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "form_usage_events" ("id", "userId", "organizationId", "createdAt")
    SELECT
        NEW."id",
        CASE WHEN form."organizationId" IS NULL THEN form."userId" ELSE NULL END,
        form."organizationId",
        NEW."createdAt"
    FROM "forms" AS form
    WHERE form."id" = NEW."formId"
    ON CONFLICT ("id") DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "form_submission_usage_event"
AFTER INSERT ON "form_submissions"
FOR EACH ROW
EXECUTE FUNCTION "record_form_usage_event"();

-- Preserve quota use for responses that exist when this migration deploys.
INSERT INTO "form_usage_events" ("id", "userId", "organizationId", "createdAt")
SELECT
    submission."id",
    CASE WHEN form."organizationId" IS NULL THEN form."userId" ELSE NULL END,
    form."organizationId",
    submission."createdAt"
FROM "form_submissions" AS submission
JOIN "forms" AS form ON form."id" = submission."formId"
ON CONFLICT ("id") DO NOTHING;

-- Build secondary indexes after the bulk backfill to reduce migration write
-- amplification. The primary key already protects idempotency during backfill.
CREATE INDEX "form_usage_events_userId_createdAt_idx"
    ON "form_usage_events"("userId", "createdAt");
CREATE INDEX "form_usage_events_organizationId_createdAt_idx"
    ON "form_usage_events"("organizationId", "createdAt");
