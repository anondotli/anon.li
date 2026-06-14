-- Reconcile schema that exists in production (and in prisma/schema.prisma) but
-- was never captured by a CREATE-TABLE migration because production was built
-- with `prisma db push`. Specifically the better-auth `mcp` plugin's OAuth
-- tables and `upload_tokens.formId` (the Form ⇄ UploadToken relation). Without
-- this, a freshly-provisioned database (CI / staging / disaster-recovery) would
-- be missing these objects even though `migrate deploy` reports success.
--
-- Every statement is guarded so this is a strict no-op on databases that already
-- have these objects (production), and provisions them on a fresh database.

-- better-auth MCP OAuth: applications
CREATE TABLE IF NOT EXISTS "oauth_applications" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "metadata" TEXT,
    "redirectUrls" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_applications_pkey" PRIMARY KEY ("id")
);

-- better-auth MCP OAuth: access/refresh tokens
CREATE TABLE IF NOT EXISTS "oauth_access_tokens" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- better-auth MCP OAuth: per-user consent
CREATE TABLE IF NOT EXISTS "oauth_consents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_applications_clientId_key" ON "oauth_applications"("clientId");
CREATE INDEX IF NOT EXISTS "oauth_applications_userId_idx" ON "oauth_applications"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_tokens_accessToken_key" ON "oauth_access_tokens"("accessToken");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_access_tokens_refreshToken_key" ON "oauth_access_tokens"("refreshToken");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_clientId_idx" ON "oauth_access_tokens"("clientId");
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_userId_idx" ON "oauth_access_tokens"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_consents_clientId_userId_key" ON "oauth_consents"("clientId", "userId");

-- Form ⇄ UploadToken relation column (db-push only on prod).
ALTER TABLE "upload_tokens" ADD COLUMN IF NOT EXISTS "formId" TEXT;
CREATE INDEX IF NOT EXISTS "upload_tokens_formId_idx" ON "upload_tokens"("formId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'upload_tokens_formId_fkey') THEN
        ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_formId_fkey"
            FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_applications_userId_fkey') THEN
        ALTER TABLE "oauth_applications" ADD CONSTRAINT "oauth_applications_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
