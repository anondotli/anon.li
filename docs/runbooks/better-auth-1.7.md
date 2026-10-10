# Runbook: better-auth 1.6 → 1.7 (MCP OAuth provider)

This release moves MCP authorization from better-auth 1.6's in-core `mcp` plugin to `@better-auth/mcp` on top of `@better-auth/oauth-provider` (+ `@better-auth/cimd`, `jwt()`), and the MCP transport to `@modelcontextprotocol/server` v2. It ships one schema migration, `prisma/migrations/20261010001000_better_auth_1_7`, which **drops** the 1.6 OAuth tables after copying their data. Take the backup in step 2 before migrating.

## What changes for users

- **Connected MCP clients that hold a refresh token** (claude.ai, Claude Code and most others request `offline_access`) recover without the user noticing. Their next call is rejected (the old opaque access token is not a JWT), and the client refreshes against its cached `/api/auth/mcp/token` endpoint. That endpoint is aliased to `/api/auth/oauth2/token`, and the refresh token migrated by the SQL returns a JWT.
- **Clients without a live refresh token** have to reconnect once and see the consent screen as before.
- **Clients keep their `client_id`.** Registrations are copied, so cached Dynamic Client Registration (DCR) credentials still work.
- **New connections** use `/api/auth/oauth2/*`, found through discovery. The consent screen is mandatory every time, and 2FA has to be completed first.
- Enabling 2FA no longer logs the user out or immediately asks for the code they just entered.

## 1. Pre-checks (production database, read-only)

```sql
-- must return 0 rows (guaranteed by the unique index, checked anyway)
SELECT "providerId", "accountId", count(*) FROM accounts GROUP BY 1, 2 HAVING count(*) > 1;

-- inventory of clients that will be imported
SELECT type, disabled, count(*) FROM oauth_applications GROUP BY 1, 2;

-- refresh tokens that will migrate (silent recovery)
SELECT count(*) FROM oauth_access_tokens
 WHERE "refreshTokenExpiresAt" > now() AND 'offline_access' = ANY (string_to_array(scopes, ' '));

-- grants that hold a migrating refresh token but no 1.6 consent row. 1.6
-- only wrote consents when a client was sent through the consent screen. The
-- migration synthesizes one consent per (client, user) pair so these grants
-- keep working and show up in Settings → Connected apps.
SELECT count(*) AS grants_needing_synthesized_consent FROM (
  SELECT DISTINCT t."clientId", t."userId"
  FROM oauth_access_tokens t
  JOIN oauth_applications a ON a."clientId" = t."clientId" AND a.disabled = false
  JOIN users u ON u.id = t."userId"
  WHERE t."refreshTokenExpiresAt" > now()
    AND 'offline_access' = ANY (string_to_array(t.scopes, ' '))
    AND NOT EXISTS (SELECT 1 FROM oauth_consents c
                    WHERE c."clientId" = t."clientId" AND c."userId" = t."userId" AND c."consentGiven")
) g;

-- PostgreSQL 11+ is required (built-in sha256())
SHOW server_version;
```

## 2. Backup (the rollback path)

```bash
pg_dump "$DATABASE_URL" --schema-only --table=oauth_applications --table=oauth_access_tokens --table=oauth_consents > oauth_v16_schema.sql
pg_dump "$DATABASE_URL" --data-only   --table=oauth_applications --table=oauth_access_tokens --table=oauth_consents > oauth_v16_data.sql
```

Also take a provider snapshot or branch if your Postgres host offers one.

## 3. Deploy order

1. Merge. Let Vercel build the production deployment **without promoting it**, or deploy a preview with production env. The build does not touch the database.
2. Run the migration against production:
   ```bash
   DATABASE_URL=… bun run db:migrate:deploy
   ```
   The migration is environment-independent except for one binding: migrated refresh tokens are bound to `https://anon.li/api/mcp` (see §5 for other environments). From this point until step 3, the old build cannot find `oauth_applications`, so MCP OAuth and `/api/mcp` calls fail. Keep this window short. The rest of the site is unaffected.
3. Promote the new deployment.
4. On first boot the app seeds the `oauth_resources` row for `${NEXT_PUBLIC_APP_URL}/api/mcp`. It creates the first `jwks` signing key (EdDSA, private key encrypted with `AUTH_SECRET`) on the first token request. No new environment variables are needed.

## 4. Verification

```bash
curl -s https://anon.li/.well-known/oauth-authorization-server | jq '.issuer, .token_endpoint, .registration_endpoint, .client_id_metadata_document_supported'
#   "https://anon.li", ".../api/auth/oauth2/token", ".../api/auth/oauth2/register", true
curl -s https://anon.li/.well-known/oauth-protected-resource/api/mcp | jq .resource
#   "https://anon.li/api/mcp"
curl -si -X POST https://anon.li/api/mcp -H 'content-type: application/json' -d '{}' | grep -i www-authenticate
#   Bearer resource_metadata="https://anon.li/.well-known/oauth-protected-resource/api/mcp", scope="anon.li:aliases anon.li:drops anon.li:forms offline_access"
```

```sql
SELECT identifier, "allowedScopes" FROM oauth_resources;          -- one row, 4 scopes
SELECT count(*) FROM oauth_clients;                                -- = oauth_applications count from §1
SELECT count(*) FROM oauth_refresh_tokens WHERE revoked IS NULL;   -- ≈ migrated count, grows as clients refresh
SELECT count(*) FROM oauth_consents WHERE id LIKE 'v16_%';         -- = grants_needing_synthesized_consent from §1
-- every migrated grant must have a consent; otherwise /api/mcp rejects its tokens. Expect 0:
SELECT count(*) FROM oauth_refresh_tokens t
 WHERE NOT EXISTS (SELECT 1 FROM oauth_consents c WHERE c."clientId" = t."clientId" AND c."userId" = t."userId");
```

Then:

- **Existing connector:** use the existing claude.ai anon.li connector. It should keep working after one silent refresh.
- **Fresh connector:** remove and re-add the claude.ai connector to exercise DCR and consent. Do the same in Claude Code (`claude mcp add --transport http anon https://anon.li/api/mcp`) and MCP Inspector.
- **2FA:** on a test account, enable 2FA from settings. You stay signed in, with no 2FA prompt.
- **Teams:** a member without 2FA in an org that enforces 2FA cannot invite members, but can still leave. Leaving removes the member's org vault-key grant and their org API keys.
- **Admin → OAuth Applications:** imported clients are listed. Disabling one cuts off its MCP access immediately and revokes its refresh tokens and consents. If you re-enable it later, users have to reconnect, and tokens issued before the disable stay dead. Clients identified by a metadata URL (CIMD) can only be disabled, because deleting one would let it re-register on its next authorization.

## 5. Non-production environments (dev, preview, self-hosted)

The migration binds migrated refresh tokens to the production resource. On any database whose `NEXT_PUBLIC_APP_URL` is not `https://anon.li`, run this once after migrating:

```sql
UPDATE oauth_refresh_tokens
   SET resources = ARRAY['<your NEXT_PUBLIC_APP_URL origin>/api/mcp']
 WHERE resources = ARRAY['https://anon.li/api/mcp'];
```

You can skip it: those clients then reconnect once instead of refreshing silently.

On Vercel previews protected by Deployment Protection, `/api/mcp` fetches its own `/api/auth/jwks` over HTTPS, which the protection would block. Enable **Protection Bypass for Automation** in the Vercel project settings. Vercel then sets `VERCEL_AUTOMATION_BYPASS_SECRET`, and `getMcpJwksUrl()` appends it to the self-fetch. Without it, MCP on protected previews returns 401.

## 6. Rollback

Restoring the pre-deploy dump would bring back clients and grants exactly as they were at cutover. That includes clients an admin disabled, and grants users revoked, during the 1.7 window. The safe, simple path is to restore, then delete every restored token (every client reconnects once), then re-apply the disables made in the 1.7 window.

1. While the 1.7 tables still exist, save the disabled clients:
   ```sql
   CREATE TABLE _rollback_disabled_clients AS
     SELECT "clientId" FROM oauth_clients WHERE disabled = true;
   ```
2. Re-promote the previous (better-auth 1.6) deployment.
3. Drop the 1.7 tables:
   ```sql
   BEGIN;
   DROP TABLE oauth_client_assertions, oauth_access_tokens, oauth_consents, oauth_refresh_tokens,
              oauth_client_resources, oauth_resources, oauth_clients, jwks CASCADE;
   DELETE FROM _prisma_migrations WHERE migration_name = '20261010001000_better_auth_1_7';
   COMMIT;
   ```
4. Restore the 1.6 tables:
   ```bash
   psql "$DATABASE_URL" < oauth_v16_schema.sql
   psql "$DATABASE_URL" < oauth_v16_data.sql
   ```
5. Revoke everything restored and re-apply the disables:
   ```sql
   BEGIN;
   -- 1.6 keeps access + refresh tokens in this table. Deleting them all makes
   -- every client re-authorize, so no grant revoked under 1.7 comes back.
   DELETE FROM oauth_access_tokens;
   UPDATE oauth_applications SET disabled = true
    WHERE "clientId" IN (SELECT "clientId" FROM _rollback_disabled_clients);
   DROP TABLE _rollback_disabled_clients;
   COMMIT;
   ```
   Clients registered only under 1.7 (new DCR or CIMD clients) do not exist after the restore. They register again when they reconnect.
6. The additive columns can stay, because 1.6 ignores them: `accounts."refreshTokenExpiresAt"`, `two_factors."failedVerificationCount"` / `"lockedUntil"`, and `verifications_identifier_idx`.

## Reference

- Code: `lib/auth.ts`, `lib/auth-hooks.ts`, `lib/mcp/oauth-request.ts`, `app/api/auth/[...all]/route.ts`, `app/api/mcp/route.ts`, `app/(auth)/oauth/consent/`.
- Clients imported from 1.6 carry `metadata.anonli_legacy_import`. The token route presents their body credentials as HTTP Basic, because 1.6 never stored their auth method and 1.7 enforces it.
- Refresh tokens rotate on every use. A retried refresh within 30 seconds gets the same response (the `mcp()` default).
