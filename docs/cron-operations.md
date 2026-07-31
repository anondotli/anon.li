# Cron operations

Vercel registers the schedules in `vercel.json` on each production deployment. All times are UTC. On Hobby, an invocation may arrive at any point during the configured hour, so no job may depend on minute-level timing.

Vercel Hobby allows at most three cron entries in `vercel.json`, so the daily workloads are consolidated behind a single aggregator that fans out to the dedicated job routes via internal HTTP calls. Each job still runs in its own function invocation with its own auth scope, Redis lock, `maxDuration`, and error reporting — the aggregator only sequences and reports. To add a new daily workload, add its route to `DAILY_JOBS` in `app/api/cron/daily/route.ts`; do not add a new `vercel.json` entry unless it genuinely needs an independent schedule.

| UTC schedule | Route | Responsibility |
| --- | --- | --- |
| Daily, 01:00 hour | `/api/cron/daily` | Aggregator; sequentially dispatches the jobs below |
| Daily, via `/api/cron/daily` | `/api/cron/domains` | Remove stale unverified domains and rotate ownership re-verification batches |
| Daily, via `/api/cron/daily` | `/api/cron/billing` | Downgrade lifecycle, crypto renewal reminders, and Stripe reconciliation |
| Daily, via `/api/cron/daily` | `/api/cron/cleanup` | Drop, Form, orphaned-file, and expired-session cleanup; includes incomplete uploads |
| Daily, via `/api/cron/daily` | `/api/cron/drip` | Welcome lifecycle emails |
| Daily, via `/api/cron/daily` | `/api/cron/crypto-recovery` | Pending-invoice reminders and expiry |
| Daily, via `/api/cron/daily` | `/api/cron/business-snapshot` | Business metrics snapshot |
| Tuesday, 15:00 hour | `/api/cron/heavy-user-upsell` | Rate-limited free-user upsell email |

## Deployment requirements

- Generate `CRON_SECRET` with `openssl rand -base64 32` and set it for the Vercel Production environment. Vercel sends it as a bearer token automatically.
- Set working `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` values. Jobs fail closed when a distributed lock cannot be acquired.
- Keep Fluid Compute enabled. Every route explicitly allows the Hobby maximum of 300 seconds and is forced dynamic to prevent cached responses.
- After changing `vercel.json`, deploy to production and verify both scheduled paths (`/api/cron/daily`, `/api/cron/heavy-user-upsell`) in Vercel Project Settings → Cron Jobs. Preview deployments do not own the production schedules.

## Reliability model

Each workload has an independent Redis lock, so duplicate Vercel delivery or a manual trigger cannot overlap the same job. Destructive operations are state-guarded, and cron-originated Resend calls use provider idempotency keys in addition to longer-lived Redis deduplication.

Vercel Cron does not retry failed invocations. Routes return HTTP 500 for thrown errors and partial failures so logs and alerts reflect the run accurately; the next scheduled run processes the remaining state. Keep batch queries bounded and idempotent when adding work.

The cleanup route is the only scheduled owner of incomplete-upload cleanup. Do not add a separate staging cleanup: on Hobby it cannot run more than daily and would duplicate destructive work.

## Incident checks

1. Open the failed path from Vercel's Cron Jobs page and inspect its function logs. For `/api/cron/daily`, the response names which job(s) failed in `failed`, and each job's own function logs are linked from its route path.
2. Check Upstash availability and lock errors before retrying destructive work.
3. Check PostgreSQL, R2, Resend, Stripe, and NOWPayments according to the failed subtask in the JSON response.
4. After the cause is fixed, invoke only the affected dedicated route (e.g. `/api/cron/cleanup`) with the production `CRON_SECRET`; its lock and state guards make a retry safe. There is no need to re-run the whole daily aggregator.
