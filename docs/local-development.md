# Local development

This guide runs anon.li against local stand-ins for PostgreSQL, Cloudflare R2, and Upstash Redis using [`compose.yml`](../compose.yml), plus provider test modes for Turnstile and Stripe. You need Bun (version in `package.json` → `packageManager`), Node.js 24 (`.node-version`), and Docker or Podman with Compose.

## 1. Start the local stack

```bash
docker compose up -d      # or: podman compose up -d
docker compose ps         # minio-init exits 0 once the bucket exists
```

| Service | Local address | Stands in for |
| --- | --- | --- |
| `postgres` (PostgreSQL 17) | `localhost:5432` | Production PostgreSQL |
| `minio` (S3 API / console) | `http://localhost:9000` / `http://localhost:9001` | Private Cloudflare R2 bucket |
| `redis-http` (serverless-redis-http → Redis 8) | `http://localhost:8079` | Upstash Redis REST |

All ports bind to `127.0.0.1`. Data persists in named volumes; `docker compose down -v` deletes it. Official MinIO images are no longer published, so the stack uses Chainguard's MinIO build. The MinIO console login is `anonli-local` / `anonli-local-secret`.

## 2. Configure `.env`

```bash
cp .env.example .env
```

Then set these values. Everything else stays as documented in `.env.example`.

```bash
NEXT_PUBLIC_APP_URL="http://localhost:3000"
DATABASE_URL="postgresql://anonli:anonli@localhost:5432/anonli"

# Generate each independently
AUTH_SECRET="$(openssl rand -base64 32)"
CRON_SECRET="$(openssl rand -base64 32)"
IP_HASH_PEPPER="$(openssl rand -base64 32)"
REPORT_ENCRYPTION_KEY="$(openssl rand -hex 32)"
DKIM_ENCRYPTION_KEY="$(openssl rand -hex 32)"

# MinIO standing in for R2 (path-style S3; HTTP is accepted for loopback only)
R2_ENDPOINT="http://localhost:9000"
R2_ACCESS_KEY_ID="anonli-local"
R2_SECRET_ACCESS_KEY="anonli-local-secret"
R2_BUCKET_NAME="anonli-local"

# Upstash REST API via serverless-redis-http (rate limiting included; see below)
UPSTASH_REDIS_REST_URL="http://localhost:8079"
UPSTASH_REDIS_REST_TOKEN="anonli-local-redis-token"

# Cloudflare Turnstile test keys: the widget always passes
NEXT_PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"
```

Paste the generated values, not the `$(...)` expressions, unless your shell expands them for you.

Notes:

- **R2 / MinIO.** `R2_ENDPOINT` must be a bare origin, and HTTP is allowed only for `localhost`/loopback. The app's S3 clients always use path-style addressing, which MinIO requires. The CSP `connect-src` is derived from `R2_ENDPOINT`, so the browser can upload straight to MinIO. MinIO allows cross-origin requests and exposes `ETag` by default, so no bucket CORS setup is needed locally. Presigned single-part, multipart, and download URLs all work.
- **Turnstile.** The captcha is always enforced, so both keys are required. Cloudflare's always-pass test keys above make every challenge succeed. Never use them outside development.
- **Redis / rate limits.** `@upstash/ratelimit` ships Lua scripts with an Upstash-only `#!lua flags=allow-key-locking` shebang that stock Redis rejects. When `UPSTASH_REDIS_REST_URL` points at a loopback host, `lib/local-redis.ts` strips that flag, so every limiter, including the fail-closed auth ones, behaves as in production. If Redis is unreachable, ordinary limiters fail open and log `Rate limit check failed`. The auth-critical limiters fail closed with HTTP 503 ("temporarily unavailable"): sign-in, registration, 2FA, password reset, email resend, org invites, and the MCP OAuth endpoints.

## 3. Database

Apply the committed migrations. Don't use `db push`, which is explained under [Schema changes](#schema-changes). A loopback `DATABASE_URL` (the compose Postgres) connects without TLS; any other host uses TLS. An explicit `sslmode` in the URL overrides both.

```bash
bun install                 # postinstall also runs `prisma generate`
bun run db:migrate:deploy
bun dev
```

The app is then at http://localhost:3000.

## 4. Stripe (test mode)

Use a Stripe **test-mode** secret key (`sk_test_...`) for `STRIPE_SECRET_KEY`. To receive webhooks locally, run the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

It prints a signing secret (`whsec_...`). Put it in `STRIPE_WEBHOOK_SECRET` and restart `bun dev`. Price IDs are optional until you exercise the matching checkout flow; create test-mode prices and paste their IDs when you do.

## 5. Email (Resend)

`AUTH_RESEND_KEY` is required, and transactional mail (magic links, verification, password reset) goes out through Resend. Set `EMAIL_FROM_DOMAIN` to a domain verified in your own Resend account; otherwise mail is sent from `anon.li`, which Resend rejects for other accounts. Outside production, the magic sign-in, email-verification and password-reset links are also written to the server log (`[dev] … link for …`). That lets you sign in locally even when delivery fails.

## Known limitations

- **Alias mail forwarding** needs the separate SMTP/Haraka service, which is not in this repository.

## Schema changes

```bash
bun run db:migrate --name concise_migration_name   # creates and applies a migration
```

Commit the generated `prisma/migrations/*` directory with the schema change. CI applies every migration to a fresh PostgreSQL 17 and fails if the result differs from `prisma/schema.prisma`.

`bun run db:push` exists only for throwaway prototyping on a database you will drop. It syncs `schema.prisma` directly and skips objects that exist only in migration SQL. One example is the partial unique index `domains_domain_verified_key`, which enforces one *verified* owner per custom domain. `db push` also records no migration history, so `db:migrate:deploy` cannot later be applied to that database.
