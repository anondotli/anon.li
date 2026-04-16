# Repository Guidelines

## Project Structure & Module Organization

This is a Bun-managed Next.js App Router project. Route groups, pages, layouts, and API handlers live in `app/`; shared UI is in `components/`, with domain folders such as `components/drop`, `components/alias`, `components/admin`, and `components/ui`. Server actions are in `actions/`, business logic and integrations are in `lib/`, and app configuration lives in `config/`. Prisma schema and migrations are in `prisma/`. MDX docs and blog content are under `content/`, public assets under `public/`, and tests under `tests/`.

## Build, Test, and Development Commands

Use Bun for dependencies and scripts.

- `bun install` installs dependencies from `bun.lock`.
- `bun dev` starts the local Next.js dev server at `http://localhost:3000`.
- `bun run build` runs `prisma generate` and creates a production build.
- `bun run start` serves the production build.
- `bun run lint` runs ESLint across the repository.
- `bun run test` runs the Vitest suite once.
- `bunx prisma generate` refreshes Prisma client code; `bunx prisma db push` syncs the local schema.

## Coding Style & Naming Conventions

Write TypeScript with strict types; avoid `any`. Use the `@/` path alias for repository-root imports when useful. Component exports use PascalCase; filenames generally follow nearby kebab-case patterns such as `login-form.tsx` or `drop-list.tsx`. Keep server-only logic in `lib/`, route handlers in `app/api`, and client components/actions separated by existing Next.js conventions. ESLint is the source of truth for formatting and correctness.

## Testing Guidelines

Vitest runs in `jsdom` with setup from `vitest.setup.ts`. Name tests `*.test.ts` or `*.test.tsx` and place broad tests in `tests/`; colocated route tests are also used for API handlers. Add focused coverage for changed behavior, especially authentication, billing, vault, crypto, storage, rate limiting, and API validation paths. Run `bun run test` before submitting changes.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative summaries with a capitalized verb, such as `Fix 2FA bug...` or `Make random aliases...`. Keep commits scoped and mention user-visible behavior when relevant. Pull requests should target `main`, describe the change, list tests run, link issues, and include screenshots for UI changes. If the database changes, include the Prisma migration and call it out.

## Security & Configuration Tips

Copy `.env.example` to `.env` for local setup, but never commit secrets. Local development requires PostgreSQL and Redis, and Drop storage depends on Cloudflare R2 configuration. Treat encryption, vault, auth, and abuse-reporting changes as security-sensitive; prefer small patches with explicit tests.
