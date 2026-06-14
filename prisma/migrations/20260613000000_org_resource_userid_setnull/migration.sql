-- Data-loss fix for B2B/orgs: an org-owned resource (organizationId set) belongs
-- to the organization, not its creating user. Previously the userId FK was
-- ON DELETE CASCADE, so a member deleting their account would cascade-delete the
-- org's aliases / recipients / forms / drops and the org-shared owner keys —
-- destroying team data. Make userId nullable with ON DELETE SET NULL so deleting
-- the creator NULLs the stamp but keeps the org-owned row. The app-level deletion
-- service additionally only deletes the user's PERSONAL rows (organizationId IS NULL).
--
-- Owner keys (drop_owner_keys / form_owner_keys) are especially critical: for an
-- org resource the single owner key is wrapped to the org vault key and is the
-- ONLY copy — it must survive the creator's deletion or the resource becomes
-- permanently undecryptable.

-- Alias.userId: String -> String? , Cascade -> SetNull
ALTER TABLE "aliases" DROP CONSTRAINT "aliases_userId_fkey";
ALTER TABLE "aliases" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recipient.userId: String -> String? , Cascade -> SetNull
ALTER TABLE "recipients" DROP CONSTRAINT "recipients_userId_fkey";
ALTER TABLE "recipients" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Form.userId: String -> String? , Cascade -> SetNull
ALTER TABLE "forms" DROP CONSTRAINT "forms_userId_fkey";
ALTER TABLE "forms" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "forms" ADD CONSTRAINT "forms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop.userId: already nullable, Cascade -> SetNull
ALTER TABLE "drops" DROP CONSTRAINT "drops_userId_fkey";
ALTER TABLE "drops" ADD CONSTRAINT "drops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropOwnerKey.userId: String -> String? , Cascade -> SetNull
ALTER TABLE "drop_owner_keys" DROP CONSTRAINT "drop_owner_keys_userId_fkey";
ALTER TABLE "drop_owner_keys" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "drop_owner_keys" ADD CONSTRAINT "drop_owner_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FormOwnerKey.userId: String -> String? , Cascade -> SetNull
ALTER TABLE "form_owner_keys" DROP CONSTRAINT "form_owner_keys_userId_fkey";
ALTER TABLE "form_owner_keys" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "form_owner_keys" ADD CONSTRAINT "form_owner_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
