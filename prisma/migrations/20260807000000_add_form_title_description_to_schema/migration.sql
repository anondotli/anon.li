-- Backfill the embedded `title` (always) and `description` (only when non-blank)
-- into each form's schemaJson. The FormSchemaDoc now carries `title` as a required
-- top-level field so the persisted JSON is self-contained.
--
-- schemaJson is always written via JSON.stringify after Zod validation, so a valid
-- JSON cast is guaranteed for rows written by this codebase. Rows whose description
-- is blank get `title` injected and any stale `description` key removed (the field
-- is optional and omits the key when empty rather than storing null).

UPDATE "forms"
SET "schemaJson" = (
    CASE
        WHEN "description" IS NOT NULL AND BTRIM("description") <> '' THEN
            jsonb_set(
                jsonb_set("schemaJson"::jsonb, '{title}', to_jsonb("title"), TRUE),
                '{description}',
                to_jsonb("description"),
                TRUE
            )
        ELSE
            (jsonb_set("schemaJson"::jsonb, '{title}', to_jsonb("title"), TRUE) #- '{description}')
    END
)::text
WHERE "schemaJson" IS NOT NULL;