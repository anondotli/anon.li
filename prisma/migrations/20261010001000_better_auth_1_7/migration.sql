-- better-auth 1.6.33 -> 1.7.7: MCP plugin moves to @better-auth/mcp on top of
-- @better-auth/oauth-provider (JWT access tokens, /oauth2/* endpoints).
--
-- 1. Additive core 1.7 columns/indexes.
-- 2. Stage the still-needed legacy 1.6 OAuth rows in session-local temp tables.
-- 3. Drop the legacy 1.6 tables (oauth_access_tokens / oauth_consents names are
--    reused by the 1.7 models; oauth_applications becomes oauth_clients).
-- 4. Create the 1.7 provider tables.
-- 5. Copy clients, live refresh tokens and granted consents into the new shape.
--
-- Access tokens are NOT migrated (1.7 issues JWTs; the old opaque ones die).
-- Refresh tokens that carried offline_access ARE migrated (hashed exactly like
-- @better-auth/oauth-provider's defaultHasher: base64url(sha256(utf8)), no pad)
-- so connected MCP clients recover with a silent refresh. Confidential client
-- secrets are hashed the same way (storeClientSecret: "hashed").
-- The oauth_resources row itself is seeded by the app on boot (mcp() resource
-- config, resourceSeedMode "insertOnly"); per-client resource links are not
-- needed because the provider runs with enforcePerClientResources: false.
--
-- ROLLBACK: restore oauth_applications / oauth_access_tokens / oauth_consents
-- from the pre-deploy pg_dump (see the operator runbook).

-- ── 1. Core 1.7 schema additions ────────────────────────────────────────────
-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "two_factors" ADD COLUMN     "failedVerificationCount" INTEGER DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- ── 2. Stage legacy rows ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.anonli_try_jsonb(value TEXT) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF value IS NULL THEN RETURN NULL; END IF;
    RETURN value::jsonb;
EXCEPTION WHEN others THEN
    RETURN NULL;
END
$$;

-- base64url(sha256(utf8(value))) without padding == oauth-provider defaultHasher.
CREATE OR REPLACE FUNCTION pg_temp.anonli_oauth_hash(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT rtrim(translate(encode(sha256(convert_to(value, 'UTF8')), 'base64'), '+/', '-_'), '=')
$$;

-- Only the anon.li MCP scopes survive (1.7 rejects unknown scopes; OIDC
-- compatibility scopes were always stripped by the 1.6 route shim).
CREATE OR REPLACE FUNCTION pg_temp.anonli_mcp_scopes(value TEXT) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(array_agg(DISTINCT s ORDER BY s), ARRAY[]::TEXT[])
    FROM unnest(string_to_array(btrim(COALESCE(value, '')), ' ')) AS s
    WHERE s IN ('anon.li:aliases', 'anon.li:drops', 'anon.li:forms', 'offline_access')
$$;

CREATE TEMP TABLE "_v16_refresh_tokens" AS
SELECT t."id", t."refreshToken", t."refreshTokenExpiresAt", t."clientId", t."userId", t."scopes", t."createdAt"
FROM "oauth_access_tokens" t
WHERE t."refreshTokenExpiresAt" > CURRENT_TIMESTAMP
  AND 'offline_access' = ANY (string_to_array(t."scopes", ' '))
  AND EXISTS (SELECT 1 FROM "oauth_applications" a WHERE a."clientId" = t."clientId" AND a."disabled" = false)
  AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = t."userId");

CREATE TEMP TABLE "_v16_consents" AS
SELECT c."id", c."clientId", c."userId", c."scopes", c."createdAt", c."updatedAt"
FROM "oauth_consents" c
WHERE c."consentGiven" = true
  AND EXISTS (SELECT 1 FROM "oauth_applications" a WHERE a."clientId" = c."clientId")
  AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = c."userId");

-- ── 3. Drop legacy tables whose names the 1.7 models reuse ──────────────────
DROP TABLE "oauth_access_tokens";
DROP TABLE "oauth_consents";

-- ── 4. 1.7 provider tables ──────────────────────────────────────────────────
-- CreateTable
CREATE TABLE "jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientDiscoveryId" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[],
    "clientCredentialsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" TEXT[],
    "backchannelLogoutUri" TEXT,
    "backchannelLogoutSessionRequired" BOOLEAN,
    "tokenEndpointAuthMethod" TEXT,
    "applicationType" TEXT,
    "jwks" TEXT,
    "jwksUri" TEXT,
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "requirePKCE" BOOLEAN,
    "dpopBoundAccessTokens" BOOLEAN DEFAULT false,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_resources" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "oauth_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client_resources" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_client_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "rotationReplayResponse" TEXT,
    "rotationReplayExpiresAt" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_access_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "oauth_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_consents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_client_assertions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_client_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

-- CreateIndex
CREATE INDEX "oauth_clients_userId_idx" ON "oauth_clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_resources_identifier_key" ON "oauth_resources"("identifier");

-- CreateIndex
CREATE INDEX "oauth_client_resources_clientId_idx" ON "oauth_client_resources"("clientId");

-- CreateIndex
CREATE INDEX "oauth_client_resources_resourceId_idx" ON "oauth_client_resources"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_client_resources_clientId_resourceId_key" ON "oauth_client_resources"("clientId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_refresh_tokens_token_key" ON "oauth_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_clientId_idx" ON "oauth_refresh_tokens"("clientId");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_sessionId_idx" ON "oauth_refresh_tokens"("sessionId");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_userId_idx" ON "oauth_refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "oauth_refresh_tokens_authorizationCodeId_idx" ON "oauth_refresh_tokens"("authorizationCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_access_tokens_token_key" ON "oauth_access_tokens"("token");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_clientId_idx" ON "oauth_access_tokens"("clientId");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_sessionId_idx" ON "oauth_access_tokens"("sessionId");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_userId_idx" ON "oauth_access_tokens"("userId");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_authorizationCodeId_idx" ON "oauth_access_tokens"("authorizationCodeId");

-- CreateIndex
CREATE INDEX "oauth_access_tokens_refreshId_idx" ON "oauth_access_tokens"("refreshId");

-- CreateIndex
CREATE INDEX "oauth_consents_clientId_idx" ON "oauth_consents"("clientId");

-- CreateIndex
CREATE INDEX "oauth_consents_userId_idx" ON "oauth_consents"("userId");

-- AddForeignKey
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_client_resources" ADD CONSTRAINT "oauth_client_resources_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "oauth_resources"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_access_tokens" ADD CONSTRAINT "oauth_access_tokens_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "oauth_refresh_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. Data migration ───────────────────────────────────────────────────────
-- 5a. oauth_applications -> oauth_clients (client_id preserved, so clients that
--     cached their DCR registration keep working without re-registering).
INSERT INTO "oauth_clients" (
    "id", "clientId", "clientSecret", "disabled", "skipConsent", "scopes",
    "clientCredentialsScopes", "userId", "createdAt", "updatedAt", "name", "icon",
    "contacts", "redirectUris", "postLogoutRedirectUris", "tokenEndpointAuthMethod",
    "applicationType", "grantTypes", "responseTypes", "dpopBoundAccessTokens", "metadata"
)
SELECT
    a."id",
    a."clientId",
    CASE
        WHEN a."type" = 'public' OR COALESCE(a."clientSecret", '') = '' THEN NULL
        ELSE pg_temp.anonli_oauth_hash(a."clientSecret")
    END,
    a."disabled",
    false,
    ARRAY['anon.li:aliases', 'anon.li:drops', 'anon.li:forms', 'offline_access']::TEXT[],
    ARRAY[]::TEXT[],
    a."userId",
    a."createdAt",
    a."updatedAt",
    a."name",
    a."icon",
    ARRAY[]::TEXT[],
    uris.list,
    ARRAY[]::TEXT[],
    -- 1.6 never persisted the registered auth method; RFC 7591's default is
    -- client_secret_basic. The token-route shim (lib/mcp/oauth-legacy.ts)
    -- re-presents body credentials as Basic for these imported clients.
    CASE WHEN a."type" = 'public' OR COALESCE(a."clientSecret", '') = '' THEN 'none' ELSE 'client_secret_basic' END,
    -- native when any redirect is loopback http or a private-use scheme
    CASE WHEN EXISTS (
        SELECT 1 FROM unnest(uris.list) AS u
        WHERE u NOT LIKE 'https://%'
           OR u ~* '^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/|$)'
    ) THEN 'native' ELSE 'web' END,
    ARRAY['authorization_code', 'refresh_token']::TEXT[],
    ARRAY['code']::TEXT[],
    false,
    jsonb_strip_nulls(jsonb_build_object(
        'anonli_legacy_import', 'better-auth-1.6-mcp',
        'anonli_legacy_type', a."type",
        'anonli_legacy_metadata', CASE
            WHEN jsonb_typeof(pg_temp.anonli_try_jsonb(a."metadata")) = 'object' THEN pg_temp.anonli_try_jsonb(a."metadata")
            ELSE NULL
        END
    ))
FROM "oauth_applications" a
CROSS JOIN LATERAL (
    SELECT COALESCE(array_agg(btrim(u) ORDER BY ord) FILTER (WHERE btrim(u) <> ''), ARRAY[]::TEXT[]) AS list
    FROM unnest(string_to_array(a."redirectUrls", ',')) WITH ORDINALITY AS r(u, ord)
) uris;

-- 5b. Live refresh tokens (offline_access, unexpired, enabled client, live user).
INSERT INTO "oauth_refresh_tokens" (
    "id", "token", "clientId", "sessionId", "userId", "resources",
    "requestedUserInfoClaims", "expiresAt", "createdAt", "scopes"
)
SELECT
    t."id",
    pg_temp.anonli_oauth_hash(t."refreshToken"),
    t."clientId",
    NULL,
    t."userId",
    -- Bind to the canonical MCP resource (= `${NEXT_PUBLIC_APP_URL}/api/mcp`).
    -- 1.7 issues a JWT only for a resource-bound grant, and Prisma reads a NULL
    -- text[] back as [] which the refresh grant treats as "no resource allowed".
    -- Self-hosters on another origin: see the runbook UPDATE after deploying.
    ARRAY['https://anon.li/api/mcp']::TEXT[],
    ARRAY[]::TEXT[],
    t."refreshTokenExpiresAt",
    t."createdAt",
    pg_temp.anonli_mcp_scopes(t."scopes")
FROM "_v16_refresh_tokens" t;

-- 5c. Consents. The 1.7 consent row is the *grant* record: Settings →
--     Connected apps lists it, revoking deletes it, and /api/mcp rejects any
--     token whose (client, user) has no consent created before the token was
--     issued (lib/mcp/auth.ts isMcpGrantActive). Every authorization still
--     forces the consent screen via prompt=consent.
--     (i) Copy the consents users explicitly gave in 1.6.
INSERT INTO "oauth_consents" (
    "id", "clientId", "userId", "resources", "requestedUserInfoClaims", "scopes", "createdAt", "updatedAt"
)
SELECT c."id", c."clientId", c."userId", ARRAY[]::TEXT[], ARRAY[]::TEXT[], pg_temp.anonli_mcp_scopes(c."scopes"), c."createdAt", c."updatedAt"
FROM "_v16_consents" c;

--     (ii) 1.6 only wrote a consent row when the client was routed through the
--     consent screen, yet issued refresh tokens either way. Synthesize one
--     consent per (client, user) that holds a migrated refresh token but has
--     no consent yet; without it the refresh would succeed and every MCP call
--     would then 401 (a refresh loop), and the grant would be invisible in
--     Connected apps. Dated to the oldest token so it predates every JWT the
--     migrated refresh tokens will mint.
INSERT INTO "oauth_consents" (
    "id", "clientId", "userId", "resources", "requestedUserInfoClaims", "scopes", "createdAt", "updatedAt"
)
SELECT
    'v16_' || md5(t."clientId" || chr(31) || t."userId"),
    t."clientId",
    t."userId",
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    pg_temp.anonli_mcp_scopes(string_agg(t."scopes", ' ')),
    min(t."createdAt"),
    max(t."createdAt")
FROM "_v16_refresh_tokens" t
WHERE NOT EXISTS (
    SELECT 1 FROM "oauth_consents" c WHERE c."clientId" = t."clientId" AND c."userId" = t."userId"
)
GROUP BY t."clientId", t."userId";

-- ── 6. Retire oauth_applications ────────────────────────────────────────────
DROP TABLE "oauth_applications";

DROP TABLE "_v16_refresh_tokens";
DROP TABLE "_v16_consents";
