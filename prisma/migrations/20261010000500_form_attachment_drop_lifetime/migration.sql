-- Form attachment drops now live exactly as long as their submission:
-- FormCleanupService deletes them together under the owner's current
-- retention, and DropCleanupService no longer reaps drops linked to a
-- submission. Clear the submit-time expiry stamped on existing attachments so
-- the owner keeps download access for the full (possibly upgraded) retention.
--
-- Legacy attachments of org forms that were created under the creator's
-- personal tenant (drop "organizationId" IS NULL) keep their expiry: an
-- organization delete cascades the form and unlinks them without deleting
-- the drop, and the expiry is what lets the drop cleanup reap them then.
UPDATE "drops" AS drop
SET "expiresAt" = NULL
FROM "form_submissions" AS submission
JOIN "forms" AS form ON form."id" = submission."formId"
WHERE submission."attachedDropId" = drop."id"
  AND drop."deletedAt" IS NULL
  AND drop."expiresAt" IS NOT NULL
  AND drop."organizationId" IS NOT DISTINCT FROM form."organizationId";
