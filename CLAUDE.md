# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

anon.li is a privacy product with three offerings, all in one Next.js App Router app:

- **Alias** — anonymous email forwarding (aliases forward to your real inbox; replies go out via SRS so the alias is never exposed). Mail is processed by a separate Haraka mail server (not in this repo) that calls back into this app's API.
- **Drop** — zero-knowledge E2EE file sharing. The browser encrypts with AES-256-GCM before upload; the decryption key lives only in the URL fragment (`#...`) and never reaches the server. Blobs go directly between browser and Cloudflare R2 via presigned URLs.
- **Form** — encrypted form submissions (owner-key encrypted, like Drop).

License is AGPL-3.0.

## Commands

Package manager is **Bun**. Always use `bun` / `bunx`, never npm/pnpm/yarn.

- `bun dev` — dev server at http://localhost:3000
- `bun run build` — runs `prisma generate` then `next build`
- `bun run start` — serve production build
- `bun run lint` — ESLint across the repo (source of truth for formatting)
- `bun run test` — full Vitest suite once
- `bun run test <pattern>` — run matching test files (e.g. `bun run test drop`)
- `bun run test -t "<name>"` — run a single test by name
- `bunx prisma generate` — regenerate Prisma client after schema edits
- `bunx prisma db push` — sync schema to local DB (no migration file)

> Tests are **Vitest** (jsdom env, `vitest.setup.ts`). Use `bun run test`, not bare `bun test` — the latter breaks JSDOM tests.

Local dev needs PostgreSQL, Redis (Upstash), and Cloudflare R2 configured. Copy `.env.example` to `.env`. The app refuses to start without `R2_PUBLIC_ENDPOINT`.

## Stack

Next.js 16 (App Router) · React 19 + React Compiler (`babel-plugin-react-compiler`) · TypeScript strict · Prisma 7 with the `@prisma/adapter-pg` driver adapter · PostgreSQL · Upstash Redis · Cloudflare R2 (S3-compatible, env vars are `R2_*`) · Tailwind v4 + Radix UI · **better-auth** for auth · Stripe + NOWPayments (crypto) for billing · Resend for email.

Import alias: `@/*` maps to the repo root.

## Architecture: the layers

Requests flow through clearly separated layers — respect them when adding code.

- **`proxy.ts`** (Next.js middleware) — builds CSP per request. App routes (`/dashboard`, `/admin`, `/api`, auth pages) get a **strict nonce-based CSP**; marketing/blog/docs/public pages get a relaxed, cacheable CSP with no nonce so the HTML can be edge-cached. The `next-themes` SSR script hash is **pinned** in this file (`NEXT_THEMES_SCRIPT_SHA256`); if you change `<ThemeProvider>` props or bump `next-themes`, the browser reports the new hash to copy in. The `matcher` excludes static assets and `/api/health`.
- **`app/`** — route groups: `(marketing)` (public, static-eligible), `(auth)`, `(dashboard)` (user app), `(admin)` (admin app, 2FA-enforced), `(public)` (e.g. drop/form download pages).
- **`actions/`** — server actions. Wrap every action in the helpers from **`lib/safe-action.ts`** (`runAction` / `runAdminAction` etc.), which handle auth, the 2FA gate, Zod validation, and rate limiting. Don't hand-roll auth in an action.
- **`lib/services/`** — business logic (e.g. `drop.ts`, `alias.ts`, `admin.ts`, `form.ts`). Actions and API routes call into services; services own the DB writes and invariants. Both class-based services and plain-function modules exist by design — don't force-merge them.
- **`lib/data/`** — read-side data access helpers (e.g. `getAuthUserState`, `getAuthApiKeyRecord`).
- **`app/api/v1/`** — the **public REST API**, authenticated by API keys (`ak_...` Bearer tokens). Auth + quota live in `lib/api-auth.ts`. An invalid explicit `ak_` key must 401 — never silently fall back to session auth.
- **`app/api/`** (non-v1) — internal/first-party endpoints: `auth/[...all]` (better-auth handler), `mcp` (MCP server), `vault/*` (E2EE key management), `webhooks/{stripe,nowpayments}`, `cron/*`, `abuse`, `billing`, `crypto`, `user`, `email`.
- **`config/`** — app configuration; `content/` — MDX blog/docs; `tests/` — broad tests (API route tests are sometimes colocated).

## Auth (better-auth, not NextAuth)

Memory or older notes may say NextAuth — that is outdated. Auth is **better-auth**.

- **`lib/auth.ts`** — the `betterAuth({...})` config with plugins: `magicLink`, `emailAndPassword` (verification required), `twoFactor` (TOTP), `mcp` (OAuth for MCP clients), `captcha` (Cloudflare Turnstile, enabled when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set).
- **`lib/auth-session.ts`** — `getSession()` returns the app-shaped `AppSession` (adds `isAdmin`, `twoFactorEnabled`, `twoFactorVerified`). React-`cache`d.
- **`auth.ts`** (repo root) — re-exports `getSession as auth`; this is what actions/api-auth import.
- **2FA gate**: when `twoFactorEnabled && !twoFactorVerified`, protected actions/routes must reject. Admin routes enforce 2FA. Keep the 2FA check ordered before CSRF where both apply.

## Zero-knowledge vault (`lib/vault/`)

E2EE for user-side secrets — encrypted alias labels/notes and the per-Drop/per-Form owner keys. Client code (`*.client.ts`, `crypto.ts`) encrypts in the browser; server (`server.ts`, `api.ts`, `app/api/vault/*`) only stores ciphertext and wrapped keys. A password reset deletes `dropOwnerKey`/`userSecurity` rows because the data is unrecoverable by design. The vault schema can be partially provisioned — code checks `getVaultSchemaState()` before touching vault tables.

Note: `lib/field-encryption.ts` is **server-side** AES-256-GCM at-rest encryption (`enc:` prefix, hex key envs) — distinct from the client-side vault. Don't conflate the two.

## Database

Single `prisma/schema.prisma`, PostgreSQL. Models use camelCase in Prisma but map to snake_case tables via `@@map` (e.g. `Drop` → `drops`, `User` → `users`). When writing raw SQL (`$queryRaw`/`$executeRaw`) use the **mapped table/column names**, not the Prisma model names. Atomic counter/strike updates are intentionally done in raw SQL with WHERE guards (download counts, abuse strikes) — keep them atomic.

## Cron

`vercel.json` registers cron paths hitting `/api/cron/*` (`daily`, `cleanup`, `heavy-user-upsell`, plus billing/domains/drip/crypto-recovery/ai-credits). Cron handlers are auth-gated via `lib/cron-auth.ts` and use `lib/cron-lock.ts` to avoid concurrent runs.

## Conventions

- TypeScript strict; avoid `any`. Component exports PascalCase; filenames kebab-case (`drop-list.tsx`).
- Keep server-only logic in `lib/` (mark with `server-only`), client modules with `client-only` / `"use client"`.
- `validateCsrf(request)` is synchronous and throws `ForbiddenError`.
- Use `lib/logger.ts` for structured logging, not raw `console.*`.
- Treat changes to crypto, vault, auth, billing, and abuse-reporting as security-sensitive: small patches, explicit tests. Add focused tests for changed behavior in auth/billing/vault/crypto/storage/rate-limit/API-validation paths.
- PRs target `main`; if the schema changes, include the Prisma migration and call it out.
