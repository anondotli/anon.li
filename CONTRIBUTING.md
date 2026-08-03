# Contributing to anon.li

Thank you for helping improve anon.li. This repository contains the Next.js web application and control plane for Alias, Drop, and Form. The separate SMTP/Haraka mail-delivery service is not part of this repository.

By contributing, you agree that your contribution is licensed under [GNU AGPL v3.0](LICENSE).

## Development setup

Use Bun for dependency management and scripts.

### Prerequisites

- Bun 1.3.5 or newer
- Node.js 24
- PostgreSQL
- A private Cloudflare R2-compatible bucket
- Upstash Redis REST credentials
- Resend, Cloudflare Turnstile, and Stripe test credentials

NOWPayments, GitHub/Google OAuth, and PostHog are optional. See [README.md](README.md#quick-start) for service responsibilities and the R2 security requirements.

### Install and run

```bash
git clone https://github.com/anondotli/anon.li.git
cd anon.li
bun install
cp .env.example .env
```

Fill every required value in `.env`. Never reuse production secrets or production user data in development.

```bash
bun run prisma:generate
bun run db:push
bun dev
```

The app is available at `http://localhost:3000`.

## Making a change

1. Create a focused branch from `main`.
2. Follow the existing App Router boundaries: routes in `app/`, shared UI in `components/`, server actions in `actions/`, and server/business logic in `lib/`.
3. Use strict TypeScript and avoid `any`. Validate all request bodies, query parameters, provider responses, and persisted JSON at their trust boundary.
4. Add focused Vitest coverage for changed behavior. Security-sensitive paths require explicit success and failure tests.
5. Run the relevant focused tests while iterating, then run the full CI-equivalent checks.

```bash
bun run test path/to/file.test.ts
bun run audit
bun run check
```

`bun run check` runs ESLint, strict type-checking, Knip, the complete Vitest suite, and a production build.

## Database changes

Schema changes must include a committed Prisma migration:

```bash
bun run db:migrate --name concise_migration_name
```

- Review the generated SQL; do not treat generated migrations as automatically safe.
- Make migrations compatible with existing production data and call out backfills, table rewrites, or long locks in the pull request.
- Use `bun run db:push` only for disposable local databases. Production uses `bun run db:migrate:deploy`.
- Never edit or reorder an already-deployed migration.

## Security and privacy invariants

Changes to auth, vaults, cryptography, billing, storage, abuse handling, and tenant ownership need extra care.

- Personal resources must remain scoped by `userId`; team resources by `organizationId` and active membership.
- Drop/Form plaintext and ordinary decryption keys must remain in the browser. Server logs, analytics, database rows, and error messages must not receive them.
- R2 objects stay private. Every client operation uses a narrowly scoped presigned capability issued after policy checks.
- Storage reservations and releases must be atomic and idempotent across retries and cleanup races.
- Security-critical rate limits and distributed locks fail closed when Redis is unavailable.
- Never commit secrets, `.env` files, production identifiers, customer content, or copied production logs.

If your finding is a vulnerability rather than a patch, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## Pull requests

- Use a concise, imperative title.
- Explain the user-visible result and important design decisions.
- List the exact checks you ran.
- Link related issues and include screenshots for UI changes.
- Call out migrations, new environment variables, operational steps, and security implications.
- Keep unrelated formatting or refactors out of the change.

Maintainers may ask for a smaller patch when a change mixes independent concerns or makes security review difficult.
