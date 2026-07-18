-- A Form upload remains private staging until recordSubmission commits. Keep
-- that state on the Drop itself so deleting a Form (and cascading its token)
-- cannot accidentally expose an abandoned completed upload.
ALTER TABLE "drops"
    ADD COLUMN "form_staging_id" TEXT;

UPDATE "drops" AS drop
SET "form_staging_id" = token."formId"
FROM "upload_tokens" AS token
WHERE token."dropId" = drop."id"
  AND token."formId" IS NOT NULL;

-- Rolling-deployment compatibility: old application instances only bind the
-- upload token. Mirror that binding onto the durable Drop marker in the DB.
CREATE FUNCTION "set_form_staging_marker_from_token"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."formId" IS NOT NULL THEN
        UPDATE "drops"
        SET "form_staging_id" = NEW."formId"
        WHERE "id" = NEW."dropId";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "upload_token_form_staging_marker"
AFTER INSERT OR UPDATE OF "formId" ON "upload_tokens"
FOR EACH ROW
EXECUTE FUNCTION "set_form_staging_marker_from_token"();

-- Likewise, an old instance may accept the Form submission without explicitly
-- clearing the new marker. The accepted relation is authoritative.
CREATE FUNCTION "clear_form_staging_marker_on_submission"()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."attachedDropId" IS NOT NULL THEN
        UPDATE "drops"
        SET "form_staging_id" = NULL
        WHERE "id" = NEW."attachedDropId";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "form_submission_clear_staging_marker"
AFTER INSERT ON "form_submissions"
FOR EACH ROW
EXECUTE FUNCTION "clear_form_staging_marker_on_submission"();

CREATE INDEX "drops_form_staging_id_idx"
    ON "drops"("form_staging_id");

CREATE INDEX "upload_tokens_formId_expiresAt_idx"
    ON "upload_tokens"("formId", "expiresAt");
