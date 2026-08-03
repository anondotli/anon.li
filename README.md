<p align="center">
  <a href="https://anon.li/?ref=github" target="_blank">
    <img src="public/og-image.png" alt="anon.li privacy toolkit" width="600" />
  </a>
</p>

<h3 align="center">Open-source email aliasing, end-to-end encrypted file sharing, and encrypted forms. Privacy by default.</h3>

<p align="center">
  <em>👋 Welcome! If you prefer a visual tour, check out our <a href="https://www.youtube.com/watch?v=J-cJT-3fp2o">2-minute intro video on YouTube</a>.</em>
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3" /></a>
  <a href="https://github.com/anondotli/anon.li"><img src="https://img.shields.io/badge/source-GitHub-blue" alt="Source on GitHub" /></a>
</p>

---

## Why anon.li?

We built anon.li because we were tired of handing our sensitive files and real email addresses to black-box companies. 

- **Email aliases that protect your real inbox - without switching email providers.** Keep using Gmail, Proton, or Fastmail; we just sit in the middle and block the spam.
- **AES-256-GCM encrypted file sharing - we can't read your files, by design.** Your browser encrypts the file before it ever hits the network. The decryption key lives in the URL fragment, so it is never transmitted to our servers.
- **Encrypted forms - collect sensitive responses without putting plaintext in the database.** Form answers and attachments are encrypted in the submitter's browser for the form owner or team.
- **Open-source web application (AGPL v3) - verify the implementation.** Audit the browser cryptography, access controls, REST API, MCP server, and application data model in this repository.

---

## Products

### Alias - Anonymous Email Forwarding
Create unique aliases for every service. Reply from your aliases without ever exposing your real identity. Emails pass through our servers for forwarding instead of being stored in a hosted mailbox.
* 10 random + 1 custom alias on Free; unlimited random + 100 custom aliases on Pro
* Anonymous replies via SRS
* Optional PGP encryption per recipient
* Custom domain support on paid plans
* Encrypted labels and notes in your vault
* One-click disable to instantly stop spam

### Drop - End-to-End Encrypted File Sharing
Share files securely. Everything is encrypted in your browser using AES-256-GCM. 
* Zero-knowledge architecture
* Automatic expiration (1–30 days)
* Download limits and password protection
* File previews count as downloads because they expose full encrypted file bytes
* Up to 250GB per transfer (Pro)
* No account required for the recipient to download

### Form - End-to-End Encrypted Data Collection
Build forms whose responses are encrypted in the respondent's browser. The application stores ciphertext and encrypted owner keys; authorized owners decrypt responses locally after unlocking their vault.
* Text, choice, rating, scale, and file-upload fields
* Per-owner and shared-team encryption keys
* Retention and submission limits enforced server-side
* Encrypted CSV/ZIP export in the browser

> [!IMPORTANT]
> This repository contains the Next.js web application and control plane. The production SMTP/Haraka delivery pipeline that receives and forwards alias email is a separate service and is not included here. You can run and develop Alias management locally, but end-to-end email forwarding requires your own compatible mail transport.

---

## Quick Start

anon.li is an integration-backed application and deliberately fails fast when required infrastructure is missing. Local development requires [Bun](https://bun.sh) \>= 1.3.5, Node.js 24, and credentials for the services below.

| Service | Purpose | Required |
|---|---|---|
| PostgreSQL | Application data and encrypted metadata | Yes |
| Private Cloudflare R2-compatible bucket | Drop/Form ciphertext | Yes |
| Upstash Redis REST | Rate limits, locks, and webhook idempotency | Yes |
| Resend | Authentication and transactional email | Yes |
| Cloudflare Turnstile | Bot protection | Yes |
| Stripe | Billing client and webhooks | Yes |
| NOWPayments | Cryptocurrency checkout | No |
| GitHub/Google OAuth | Optional login providers | No |
| PostHog | Product analytics and error reporting | No |

```bash
git clone https://github.com/anondotli/anon.li.git
cd anon.li
bun install
cp .env.example .env

# Fill every required value in .env, then initialize the local database
bun run prisma:generate
bun run db:push

# Start the development server
bun dev
```

Open `http://localhost:3000`. Blank optional provider variables are normalized as disabled; required variables are validated at startup. Use independent generated values for `AUTH_SECRET`, `CRON_SECRET`, `IP_HASH_PEPPER`, `REPORT_ENCRYPTION_KEY`, and `DKIM_ENCRYPTION_KEY` as documented in `.env.example`.

Before opening a pull request, run the same checks enforced by CI:

```bash
bun run audit
bun run check  # lint, type-check, dead-code check, tests, and production build
```

### Production deployment

Production databases must be updated with the committed Prisma migrations. Do not use `prisma db push` in production; it bypasses the reviewed migration history.

```bash
bun install --frozen-lockfile
bun run build
bun run db:migrate:deploy
bun run start
```

Set every required variable documented in `.env.example` in the deployment platform, back up the database before applying migrations, and run `bun run db:migrate:deploy` once per release before starting the new application version. The build command regenerates the Prisma client automatically. Use HTTPS for every public service origin; plain HTTP is accepted only for loopback development endpoints.

Vercel deployments also require `CRON_SECRET` and Upstash Redis. The production schedules are intentionally limited to Hobby-compatible daily/weekly expressions; see the [cron operations runbook](docs/cron-operations.md) for the schedule, rollout checks, and failure handling.

Client-IP rate limits trust one edge only. Vercel is detected automatically. On a self-hosted origin behind Cloudflare, set `TRUSTED_PROXY_PROVIDER=cloudflare` and restrict direct origin traffic to Cloudflare's network; otherwise forwarding headers are spoofable.

### One-time Cloudflare R2 setup

anon.li Drop uploads and downloads blob data directly between the browser and R2 via S3 presigned URLs, avoiding server-side relay bottlenecks. Download URLs are short-lived; multipart upload URLs are bound to an upload ID, part number, and exact encrypted byte length and last up to seven days so very large transfers can complete.

1. Create an R2 bucket and keep it private. Disable its public `r2.dev` URL and do not attach a public custom domain. Public object access would bypass Drop expiry, revocation, recipient, and download-limit checks.
2. Create R2 API credentials with object read/write access to that bucket, then set `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and the account S3 API endpoint (`R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`) in `.env`.
3. Configure the bucket's CORS rules to allow `GET`, `HEAD`, and `PUT` from your application origin and expose the `ETag` response header. Browser transfers still go directly to R2; R2 does not charge internet egress fees.

Cloudflare presigned URLs are supported on the S3 API domain, not on custom domains. Treat private-bucket access as a security requirement, not only a deployment preference.

## Architecture and trust boundaries

```text
Browser (plaintext + keys)
  ├─ HTTPS → Next.js app (auth, policy, metadata, presigned capabilities)
  └─ presigned HTTPS → private R2 bucket (ciphertext only)

Next.js app
  ├─ PostgreSQL (accounts, policy metadata, ciphertext metadata, wrapped keys)
  └─ Redis REST (rate limits, locks, webhook idempotency)

External providers: Resend, Stripe, Turnstile, optional NOWPayments/PostHog/OAuth
Separate deployment: inbound/outbound alias mail transport
```

- Drop and Form content is encrypted with Web Crypto in the browser. Share-link keys stay in URL fragments, which browsers do not send in HTTP requests.
- The application server is trusted for authentication, authorization, quotas, expiry, download counters, and encrypted-key distribution. It must never receive ordinary Drop/Form plaintext keys.
- R2 must remain private. Clients receive short-lived, operation-specific presigned URLs only after application policy checks.
- PostgreSQL stores account data, policy metadata, ciphertext metadata, and wrapped keys. Redis is availability- and abuse-sensitive, so security-critical limits fail closed when it is unavailable.
- Alias forwarding is not zero-knowledge: a compatible mail transport necessarily handles message content while forwarding it. See the [security documentation](https://anon.li/security) for the production retention model.

## Tech Stack

**Next.js 16** (App Router) · **React 19** · **PostgreSQL** + **Prisma** · **Better Auth** (magic links, email/password, TOTP 2FA) · **Cloudflare R2** · **Stripe** · **Upstash Redis** · **Resend** · **Tailwind CSS** + **shadcn/ui**

## Links

  - **Live site**: [anon.li](https://anon.li)
  - **Security architecture**: [anon.li/security](https://anon.li/security)
  - **API docs**: [anon.li/docs/api](https://anon.li/docs/api)
  - **Service status**: [status.anon.li](https://status.anon.li)
  - **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)
  - **Source code**: [github.com/anondotli/anon.li](https://github.com/anondotli/anon.li)
  - **Report vulnerabilities**: [security@anon.li](mailto:security@anon.li)

-----

## Legal & License

Jurisdiction: Liechtenstein · [Privacy Policy](https://anon.li/privacy) · [Terms](https://anon.li/terms) · [AUP](https://anon.li/docs/legal/aup) · [DMCA](https://anon.li/docs/legal/dmca)

**[GNU Affero General Public License v3.0](https://github.com/anondotli/anon.li/blob/main/LICENSE)** - Copyright © 2026 anon.li.
