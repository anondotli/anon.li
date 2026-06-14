-- anon.li Form: create the `forms`, `form_owner_keys`, and `form_submissions`
-- tables. This migration was originally a no-op placeholder because production
-- was provisioned via `prisma db push`, so the form tables existed out-of-band
-- and never had a CREATE-TABLE migration. That broke fresh provisioning
-- (`prisma migrate deploy` on a new DB failed at the first later `ALTER TABLE
-- "forms"`). The DDL below reconstructs the tables at their HISTORICAL shape
-- (i.e. right after this migration, before later migrations add the
-- custom-key-verifier column, the organization columns, and the userId
-- SetNull change), so every subsequent migration still applies unchanged.
--
-- Everything is fully guarded (IF NOT EXISTS / pg_constraint / pg_type checks)
-- so this is a genuine no-op on any database that already has the tables
-- (production, which has these migrations baselined as applied), while cleanly
-- provisioning a brand-new database (CI / staging / disaster-recovery).

-- Enum used by the historical `forms.fileQuotaMode` column (dropped later by
-- 20260426160000_drop_form_file_quota_mode). Recreated here so that DROP applies.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'form_file_quota_mode') THEN
        CREATE TYPE "form_file_quota_mode" AS ENUM ('shared', 'per_submission');
    END IF;
END
$$;

-- forms
CREATE TABLE IF NOT EXISTS "forms" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "schemaJson" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "disabledByUser" BOOLEAN NOT NULL DEFAULT false,
    "customKey" BOOLEAN NOT NULL DEFAULT false,
    "salt" TEXT,
    "customKeyData" TEXT,
    "customKeyIv" TEXT,
    "maxSubmissions" INTEGER,
    "closesAt" TIMESTAMP(3),
    "hideBranding" BOOLEAN NOT NULL DEFAULT false,
    "allowFileUploads" BOOLEAN NOT NULL DEFAULT false,
    "maxFileSizeOverride" BIGINT,
    "fileQuotaMode" "form_file_quota_mode",
    "notifyAliasId" TEXT,
    "notifyEmailFallback" BOOLEAN NOT NULL DEFAULT true,
    "submissionsCount" INTEGER NOT NULL DEFAULT 0,
    "takenDown" BOOLEAN NOT NULL DEFAULT false,
    "takedownReason" TEXT,
    "takenDownAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "forms_userId_idx" ON "forms"("userId");
CREATE INDEX IF NOT EXISTS "forms_userId_deletedAt_createdAt_idx" ON "forms"("userId", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "forms_closesAt_idx" ON "forms"("closesAt");
CREATE INDEX IF NOT EXISTS "forms_notifyAliasId_idx" ON "forms"("notifyAliasId");

-- form_owner_keys
CREATE TABLE IF NOT EXISTS "form_owner_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "wrapped_key" TEXT NOT NULL,
    "vault_generation" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_owner_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "form_owner_keys_formId_key" ON "form_owner_keys"("formId");
CREATE INDEX IF NOT EXISTS "form_owner_keys_userId_idx" ON "form_owner_keys"("userId");

-- form_submissions
CREATE TABLE IF NOT EXISTS "form_submissions" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "ephemeralPubKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "attachedDropId" TEXT,
    "submitterUserId" TEXT,
    "submitterIpHash" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "form_submissions_attachedDropId_key" ON "form_submissions"("attachedDropId");
CREATE INDEX IF NOT EXISTS "form_submissions_formId_createdAt_idx" ON "form_submissions"("formId", "createdAt");
CREATE INDEX IF NOT EXISTS "form_submissions_submitterUserId_idx" ON "form_submissions"("submitterUserId");

-- Foreign keys (guarded so re-running against an existing schema is a no-op).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forms_userId_fkey') THEN
        ALTER TABLE "forms" ADD CONSTRAINT "forms_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forms_notifyAliasId_fkey') THEN
        ALTER TABLE "forms" ADD CONSTRAINT "forms_notifyAliasId_fkey"
            FOREIGN KEY ("notifyAliasId") REFERENCES "aliases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_owner_keys_userId_fkey') THEN
        ALTER TABLE "form_owner_keys" ADD CONSTRAINT "form_owner_keys_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_owner_keys_formId_fkey') THEN
        ALTER TABLE "form_owner_keys" ADD CONSTRAINT "form_owner_keys_formId_fkey"
            FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_formId_fkey') THEN
        ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_formId_fkey"
            FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_attachedDropId_fkey') THEN
        ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_attachedDropId_fkey"
            FOREIGN KEY ("attachedDropId") REFERENCES "drops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_submitterUserId_fkey') THEN
        ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_submitterUserId_fkey"
            FOREIGN KEY ("submitterUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
