-- Add encrypted alias metadata fields.
-- Existing label/note columns are retained as legacy plaintext until each user
-- unlocks their vault and completes the client-side migration.
ALTER TABLE "aliases"
ADD COLUMN "encrypted_label" TEXT,
ADD COLUMN "encrypted_note" TEXT;
