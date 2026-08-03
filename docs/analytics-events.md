# Analytics event catalog

PostHog is the single source of truth for product and revenue metrics (project: anon.li, EU). This catalog documents every server-side event, where it is emitted, and its properties. Server events are authoritative (ad-blocker-proof); client-side events in `lib/analytics.ts` cover in-page UX signals only.

**Conventions**

- Server events go through `trackServerEvent(distinctId, event, properties)` (`lib/posthog.server.ts`) — capture + flush-after-response in one call.
- `distinctId` is always the internal user id (or organization id when the user is gone — org-scoped billing events).
- Properties are auto-sanitized by the logger's redaction before sending. Never add emails, tokens, or free-text user content to properties.
- Events are emitted **after** the DB transaction commits, never inside it.
- Stripe webhook events sit inside the Redis idempotency guard (`tryClaimEvent`), so replays do not double-count.

## Naming map (plan.md business terms → event names)

| plan.md term | Event | Notes |
|---|---|---|
| `checkout_started` | `checkout_started` | server-side, canonical |
| `purchase_completed` | `subscription_activated` | pre-existing name kept; fires on new activation from both providers |
| `purchase_failed` | `purchase_failed` | Stripe invoice failures + crypto failed/underpaid/price_mismatch |
| `crypto_invoice_created/paid/expired` | `crypto_invoice_created` / `crypto_invoice_paid` / `crypto_invoice_expired` | NOWPayments lifecycle |
| `form_created` / `form_published` | `form_created` | forms have no draft state — creation is publishing; `form_published` is intentionally not emitted |
| `domain_added` | `domain_added` | |
| `team_created` | `team_created` | |
| `seat_added` | `seat_added` | |

## Revenue events

### `checkout_started`

A Stripe Checkout Session was created (the user was redirected to Stripe).

- Sites: `actions/create-checkout-session.ts`, `actions/create-team-checkout.ts`, `app/api/v1/checkout/route.ts`
- Properties: `provider` ("stripe"), `product`, `tier`, `frequency` ("monthly"|"yearly"), `price_id`, `flow` ("personal"|"team"|"api"), `has_promo_code` (personal), `seats` (team)

### `subscription_activated`

A new subscription became active — **the purchase event**. Fires from `checkout.session.completed` (Stripe) and from NOWPayments success statuses (`finished`/`confirmed`/`sending`).

- Sites: `app/api/webhooks/stripe/route.ts` (`handleCheckoutSessionCompleted`), `app/api/webhooks/nowpayments/route.ts` (`postActivationSideEffects`)
- Properties: `provider` ("stripe"|"crypto"), `product`, `tier`, `frequency`, `amount`, `currency`, `price_id` (stripe), `billing_reason` ("new")
- Not emitted on renewals (`invoice.payment_succeeded`) — renewal health is tracked via `purchase_failed` + the daily `business_snapshot` MRR.

### `checkout_expired`

A Stripe Checkout Session expired unpaid (~24 h after creation) — the funnel's loss event, and the trigger for the abandoned-checkout recovery email (WS2). Emitted **before** the email gating (already-subscribed check, per-user 7-day throttle), so it counts every abandonment even when no email is sent. `is_org_checkout` marks team checkouts; the recovery email itself is deduped by a `checkout-recovery/{session_id}` Resend idempotency key.

- Site: `app/api/webhooks/stripe/route.ts` (`handleCheckoutSessionExpired`)
- Properties: `provider` ("stripe"), `product`, `tier`, `frequency`, `price_id`, `is_org_checkout`, `session_id`

### `purchase_failed`

A payment attempt failed. For Stripe this fires per attempt (each retry is a distinct event — `invoice_id` dedupes); `billing_reason: "subscription_cycle"` failures are the involuntary-churn (dunning) signal, `"subscription_create"` failures are abandoned first purchases.

- Sites: Stripe webhook `handleInvoicePaymentFailed`; NOWPayments webhook failed/underpaid/price_mismatch branches
- Properties: `provider`, `product`, `tier`, `amount`, `currency`, `billing_reason` + `failure_code` + `invoice_id` (stripe) | `failure_reason` + `order_id` (crypto)

### `subscription_canceled`

A subscription ended. `cancel_reason: "payment_failed"` = involuntary churn; `"cancellation_requested"` = voluntary; `"refunded"` = crypto refund.

- Sites: Stripe webhook `handleCustomerSubscriptionDeleted`; NOWPayments webhook refund branch
- Properties: `provider`, `product`, `tier`, `cancel_reason`

## Crypto lifecycle events

### `crypto_invoice_created`

- Site: `actions/create-crypto-checkout.ts`
- Properties: `product`, `tier`, `amount`, `order_id`

### `crypto_invoice_paid`

NOWPayments confirmed payment (fires alongside `subscription_activated` with `provider: "crypto"` — this event exists so the crypto funnel is self-contained).

- Site: NOWPayments webhook `postActivationSideEffects`
- Properties: `product`, `tier`, `amount`, `order_id`

### `crypto_invoice_expired`

Invoice expired unpaid. Emitted from the webhook (`expired` status) **and** the recovery cron (invoices NOWPayments never calls back about). `source` distinguishes them.

- Sites: NOWPayments webhook; `lib/services/cron-crypto-recovery.ts`
- Properties: `product`, `tier`, `amount`, `order_id`, `source` ("webhook"|"cron")

## Product events

### `user_signed_up`

A user row was created (email-verified or OAuth). Historical rows were backfilled once with `backfill: true` and original timestamps.

- Site: `lib/auth.ts` `databaseHooks.user.create.after`
- Properties: none (signup method is not reliably known at hook time)

### `form_created`

- Site: `lib/services/form.ts` `FormService.createForm`
- Properties: `form_id`, `has_file_uploads`, `is_org_form`

### `domain_added`

A custom alias domain row was created (verification is a later step, not tracked here).

- Site: `lib/services/domain.ts` `DomainService.createDomain`
- Properties: `is_org_domain`

### `team_created`

- Site: `lib/auth.ts` `afterCreateOrganization` organization hook
- Properties: `team_id`

### `seat_added`

A member joined an organization (invitation accepted).

- Site: `lib/auth.ts` `afterAddMember` organization hook
- Properties: `team_id`, `role`

## Operational snapshot

### `business_snapshot`

Emitted daily by `/api/cron/business-snapshot`. Dashboard source for MRR and alias-active users (DB facts, not user events). `distinctId` is the constant `"business_metrics"`.

- Site: `lib/services/cron-business-snapshot.ts`
- Properties: `mrr_usd` (book MRR: active subscriptions × plan list prices from `config/plans.ts`, yearly ÷ 12, business = seat price × seats; Stripe settles EUR but book MRR is the operational USD metric), `alias_active_users_30d` (distinct owners of aliases with `last_email_at` in the last 30 days), `active_subscriptions`, `total_registered_users`, `snapshot_date`

## CEO Friday Review (dashboard)

PostHog dashboard "CEO Friday Review" — the weekly review artifact (Fridays, 30 min, never skipped):

1. Signups/wk — trends on `user_signed_up`
2. Activation % — funnel `user_signed_up` → (`alias_created` OR `drop_upload_completed`) within 24h
3. W1/W2 retention — retention insight, start `user_signed_up`, return = any event
4. Revenue funnel — `$pageview` `/pricing` → `checkout_started` → `subscription_activated` (loss branch: `checkout_expired`, split by whether the recovery email was sent)
5. MRR — latest-value trend on `business_snapshot.mrr_usd`
6. Alias-active users — latest-value trend on `business_snapshot.alias_active_users_30d`
7. Dunning monitor — `purchase_failed` by provider/billing_reason
8. Crypto funnel — `crypto_invoice_created` → paid vs expired
