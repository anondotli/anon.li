/**
 * Time-boxed marketing promotions.
 *
 * The Stripe promotion code is what actually grants the discount (amount,
 * duration, expiry, eligibility) — this file only decides when the website
 * advertises it. Keep `endsAt` aligned with the code's `expires_at` in Stripe
 * so the site never advertises a code that no longer redeems. Only Stripe
 * (card) checkout accepts promotion codes; crypto checkout does not.
 *
 * Client-safe: no server imports. Who may see a promotion (never paying
 * customers) is decided server-side in `lib/promotions.ts`.
 */

export interface Promotion {
    /** Stable id; also namespaces the per-browser dismissal flag. */
    id: string
    /** Short campaign name shown in the UI. */
    name: string
    /** Stripe promotion code customers enter at Stripe Checkout. */
    code: string
    percentOff: number
    /** Number of billing months the discount applies to. */
    durationMonths: number
    /** Inclusive start (UTC). */
    startsAt: Date
    /** Exclusive end (UTC). */
    endsAt: Date
}

const PROMOTIONS: readonly Promotion[] = [
    {
        id: "black-friday-2026",
        name: "Black Friday",
        code: "BLKFRI40",
        percentOff: 40,
        durationMonths: 12,
        startsAt: new Date("2026-11-01T00:00:00Z"),
        // Runs through Dec 6, 23:59 UTC — the same instant Stripe expires the code.
        endsAt: new Date("2026-12-06T23:59:00Z"),
    },
]

/** The promotion running at `now`, if any. */
export function getActivePromotion(now: number = Date.now()): Promotion | null {
    return PROMOTIONS.find((p) => p.startsAt.getTime() <= now && now < p.endsAt.getTime()) ?? null
}
