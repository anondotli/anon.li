/**
 * Billing Downgrade Service
 *
 * Handles graduated resource removal when a user's PERSONAL subscription ends.
 * Three phases (delays from `lib/constants` — currently 7 + 7 days):
 *   Phase 1 (day 0):  Record downgrade, send warning email
 *   Phase 2 (day 7):  Schedule excess resources for removal
 *   Phase 3 (day 14): Delete scheduled resources
 *
 * SCOPE: every resource query here is restricted to the user's PERSONAL
 * resources (`organizationId: null`). Org-owned resources a member created
 * belong to the org and are governed by the org's (seat-based) plan — a
 * personal downgrade must never count, schedule, or delete them.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getPlanLimits, getDropLimits, getRecipientLimit } from "@/lib/limits";
import {
    DAY_MS,
    DOWNGRADE_SCHEDULING_DELAY_DAYS,
    DOWNGRADE_DELETION_DELAY_DAYS,
    SUBSCRIPTION_GRACE_PERIOD_DAYS,
} from "@/lib/constants";
import { abortMultipartUpload, deleteObject } from "@/lib/storage";
import { deleteDropFilesAndReleaseQuota } from "@/lib/services/drop-storage";
import { restoreGraceStampedDrops } from "@/lib/services/drop-grace";
import { dunningSubscriptionWhere, isWithinDunningWindow, MAX_DUNNING_DAYS } from "@/lib/services/billing-dunning";
import { entitlingSubscriptionWhere, isEntitlingSubscription } from "@/lib/subscription-entitlement";

const logger = createLogger("BillingDowngrade");

const ENTITLEMENT_SUBSCRIPTION_FIELDS = {
    id: true,
    status: true,
    product: true,
    tier: true,
    currentPeriodEnd: true,
} satisfies Prisma.SubscriptionSelect;

/**
 * Everything getPlanLimits/getDropLimits need to resolve a user's CURRENT
 * entitlement for their personal resources, exactly as live enforcement
 * (lib/data/user.ts getUserById, lib/entitlements.ts) resolves it: entitling
 * personal subscriptions, the subscriptions of every team the user belongs to
 * (seat-based inheritance — a Business member keeps team-level limits on their
 * personal resources), plus complimentary referral Plus. A function so the
 * team-subscription period cut-off is evaluated per query.
 */
function entitlementSelect() {
    return {
        referralPlusUntil: true,
        subscriptions: {
            where: {
                organizationId: null,
                status: { in: ["active", "trialing"] },
            },
            select: ENTITLEMENT_SUBSCRIPTION_FIELDS,
        },
        memberships: {
            select: {
                organization: {
                    select: {
                        subscriptions: {
                            where: entitlingSubscriptionWhere(),
                            select: ENTITLEMENT_SUBSCRIPTION_FIELDS,
                        },
                    },
                },
            },
        },
    } satisfies Prisma.UserSelect;
}

type EntitlementSubscription = {
    status: string;
    product: string;
    tier: string;
    currentPeriodEnd: Date | null;
};

type EntitlementRow = {
    referralPlusUntil: Date | null;
    subscriptions: EntitlementSubscription[];
    memberships?: { organization: { subscriptions: EntitlementSubscription[] } }[] | null;
};

/** Team (org) subscriptions the user inherits through memberships. */
function teamSubscriptionsOf(user: EntitlementRow): EntitlementSubscription[] {
    return (user.memberships ?? []).flatMap((m) => m.organization?.subscriptions ?? []);
}

/** Limits context: personal + inherited team subscriptions + referral Plus. */
function toLimitsContext(user: EntitlementRow | null) {
    if (!user) return null;
    return {
        referralPlusUntil: user.referralPlusUntil,
        subscriptions: [...user.subscriptions, ...teamSubscriptionsOf(user)],
    };
}

function hasActiveReferralPlus(user: { referralPlusUntil: Date | null }): boolean {
    return Boolean(user.referralPlusUntil && user.referralPlusUntil.getTime() > Date.now());
}

/** Excess over a limit, where -1 means unlimited. */
function excessOver(count: number, limit: number): number {
    return limit === -1 ? 0 : Math.max(0, count - limit);
}

/**
 * Users who inherit an entitling subscription from a team they belong to.
 * Used to keep them out of the downgrade batches (they are not actionable while
 * the team plan lasts, exactly like referral Plus holders).
 */
function noTeamEntitlementWhere(): Prisma.UserWhereInput {
    return {
        memberships: {
            none: { organization: { subscriptions: { some: entitlingSubscriptionWhere() } } },
        },
    };
}

/**
 * Fisher-Yates shuffle and return the first `count` items.
 */
function shuffleAndTake<T>(arr: T[], count: number): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
        const tempI = a[i];
        const tempJ = a[j];
        if (tempI !== undefined && tempJ !== undefined) {
            a[i] = tempJ;
            a[j] = tempI;
        }
    }
    return a.slice(0, count);
}

/**
 * Keep aliases forwarding when recipients they route to are about to be
 * deleted. Join rows to the deleted recipients cascade away with them, so an
 * alias left with no other recipient gets the fallback as its primary; one that
 * keeps other recipients but loses its primary promotes the next by ordinal.
 * The legacy single-recipient pointer is repointed to the fallback.
 */
async function reassignAliasesFromRecipients(
    tx: Prisma.TransactionClient,
    recipientIds: string[],
    fallbackRecipientId: string,
): Promise<void> {
    const affectedRows = await tx.aliasRecipient.findMany({
        where: { recipientId: { in: recipientIds } },
        select: { aliasId: true, isPrimary: true },
    });
    const affectedAliasIds = [...new Set(affectedRows.map((row) => row.aliasId))];

    if (affectedAliasIds.length > 0) {
        const remainingRows = await tx.aliasRecipient.findMany({
            where: { aliasId: { in: affectedAliasIds }, recipientId: { notIn: recipientIds } },
            select: { id: true, aliasId: true, isPrimary: true },
            orderBy: { ordinal: "asc" },
        });
        const aliasesWithRemaining = new Set(remainingRows.map((row) => row.aliasId));
        const aliasesWithRemainingPrimary = new Set(
            remainingRows.filter((row) => row.isPrimary).map((row) => row.aliasId),
        );

        const orphanedAliasIds = affectedAliasIds.filter((id) => !aliasesWithRemaining.has(id));
        if (orphanedAliasIds.length > 0) {
            await tx.aliasRecipient.createMany({
                data: orphanedAliasIds.map((aliasId) => ({
                    aliasId,
                    recipientId: fallbackRecipientId,
                    ordinal: 0,
                    isPrimary: true,
                })),
                skipDuplicates: true,
            });
        }

        const lostPrimaryAliasIds = new Set(
            affectedRows
                .filter((row) => row.isPrimary && aliasesWithRemaining.has(row.aliasId))
                .filter((row) => !aliasesWithRemainingPrimary.has(row.aliasId))
                .map((row) => row.aliasId),
        );
        const promotedRowIds = [...lostPrimaryAliasIds]
            .map((aliasId) => remainingRows.find((row) => row.aliasId === aliasId)?.id)
            .filter((id): id is string => Boolean(id));
        if (promotedRowIds.length > 0) {
            await tx.aliasRecipient.updateMany({
                where: { id: { in: promotedRowIds } },
                data: { isPrimary: true },
            });
        }
    }

    await tx.alias.updateMany({
        where: { recipientId: { in: recipientIds } },
        data: { recipientId: fallbackRecipientId },
    });
}

export class BillingDowngradeService {
    // ─── Phase 1 ───────────────────────────────────────────────

    /**
     * Record that a user was downgraded to free tier.
     * Idempotent: won't overwrite an existing downgradedAt.
     */
    static async recordDowngrade(userId: string): Promise<void> {
        const result = await prisma.user.updateMany({
            where: { id: userId, downgradedAt: null },
            data: { downgradedAt: new Date() },
        });

        if (result.count > 0) {
            logger.info("Recorded downgrade", { userId });
        }
    }

    /**
     * Cancel an active downgrade (user re-subscribed).
     * Clears downgradedAt and unsets scheduledForRemovalAt on all resources.
     */
    static async cancelDowngrade(userId: string): Promise<void> {
        const entitlement = await prisma.user.findUnique({
            where: { id: userId },
            select: entitlementSelect(),
        });
        const [, aliases, domains, recipients, restoredDrops] = await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: { downgradedAt: null },
            }),
            prisma.alias.updateMany({
                where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } },
                data: { scheduledForRemovalAt: null },
            }),
            prisma.domain.updateMany({
                where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } },
                data: { scheduledForRemovalAt: null },
            }),
            prisma.recipient.updateMany({
                where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } },
                data: { scheduledForRemovalAt: null },
            }),
            // Restore drops that were unlimited before the billing loss, as
            // far as the plan now in force allows (see restoreGraceStampedDrops).
            restoreGraceStampedDrops(
                Prisma.sql`"userId" = ${userId} AND "organizationId" IS NULL`,
                getDropLimits(toLimitsContext(entitlement)).maxExpiry,
            ),
        ]);

        const total = aliases.count + domains.count + recipients.count + restoredDrops;
        if (total > 0) {
            logger.info("Cancelled downgrade and unscheduled resources", {
                userId,
                unscheduled: { aliases: aliases.count, domains: domains.count, recipients: recipients.count },
                restoredDrops,
            });
        }
    }

    /**
     * Whether the user's personal Stripe subscription is still in dunning, and
     * the downgrade marker is recent enough for that to hold back scheduling.
     */
    static async isInDunning(userId: string, downgradedAt: Date | null): Promise<boolean> {
        if (!isWithinDunningWindow(downgradedAt)) return false;
        const count = await prisma.subscription.count({
            where: { userId, ...dunningSubscriptionWhere },
        });
        return count > 0;
    }

    /**
     * Whether the user holds an entitling PERSONAL subscription (any provider)
     * whose paid period has not lapsed past the one-day access grace.
     */
    static async hasActivePersonalSubscription(userId: string): Promise<boolean> {
        const count = await prisma.subscription.count({
            where: {
                userId,
                organizationId: null,
                status: { in: ["active", "trialing"] },
                OR: [
                    { currentPeriodEnd: null },
                    { currentPeriodEnd: { gt: new Date(Date.now() - DAY_MS) } },
                ],
            },
        });
        return count > 0;
    }

    /**
     * Side effects of a user losing their last PERSONAL paid subscription
     * (Stripe terminal state, crypto period lapse, or crypto refund):
     * unlimited drops get a grace-period expiry (tracked so recovery can undo
     * it), the downgrade clock starts, and — when `notify`, i.e. on the first
     * terminal signal for this loss — the clock is restarted and the user told.
     *
     * Email failures are logged but never thrown, so a webhook retry cannot
     * re-send it. Returns the drop grace expiry.
     */
    static async handlePersonalSubscriptionLoss(
        userId: string,
        email: string | null,
        opts: { notify: boolean },
    ): Promise<Date> {
        const dropExpiryDate = new Date(Date.now() + SUBSCRIPTION_GRACE_PERIOD_DAYS * DAY_MS);

        const stampedDrops = await prisma.drop.updateMany({
            where: {
                userId,
                organizationId: null,
                expiresAt: null, // Only drops with unlimited expiry
                deletedAt: null,
                // Form attachments are unlimited by design; their lifetime is
                // owned by Form submission retention, not the Drop plan.
                formSubmission: null,
                formStagingId: null,
                uploadTokens: { none: { formId: { not: null } } },
            },
            data: {
                expiresAt: dropExpiryDate,
                billingGraceExpiresAt: dropExpiryDate,
            },
        });

        if (opts.notify) {
            // First terminal signal for this loss: (re)start the 7+7-day clock
            // now. A marker set earlier (e.g. Form retention grace during
            // dunning) must not shorten the warning window promised below.
            await prisma.user.updateMany({
                where: { id: userId },
                data: { downgradedAt: new Date() },
            });
        } else {
            await this.recordDowngrade(userId);
        }

        if (!opts.notify || !email) return dropExpiryDate;

        try {
            const excess = await this.calculateExcess(userId);
            const hasExcess = excess.excessRandom + excess.excessCustom + excess.excessDomains + excess.excessRecipients > 0;

            if (hasExcess) {
                const schedulingDate = new Date(Date.now() + DOWNGRADE_SCHEDULING_DELAY_DAYS * DAY_MS);
                const deletionDate = new Date(Date.now() + (DOWNGRADE_SCHEDULING_DELAY_DAYS + DOWNGRADE_DELETION_DELAY_DAYS) * DAY_MS);

                const { sendDowngradeWarningEmail } = await import("@/lib/resend");
                await sendDowngradeWarningEmail(email, excess, schedulingDate, deletionDate, {
                    count: stampedDrops?.count ?? 0,
                    expiresAt: dropExpiryDate,
                });
            } else {
                const { sendSubscriptionCanceledEmail } = await import("@/lib/resend");
                await sendSubscriptionCanceledEmail(email, dropExpiryDate);
            }
        } catch (error) {
            logger.error("Failed to send downgrade notification email", error, { userId });
        }

        return dropExpiryDate;
    }

    // ─── Phase 1 helpers ───────────────────────────────────────

    /**
     * Calculate how many excess resources a user has relative to the limits
     * they keep after the downgrade (free, or Plus while referral Plus lasts).
     */
    static async calculateExcess(userId: string): Promise<{
        excessRandom: number;
        excessCustom: number;
        excessDomains: number;
        excessRecipients: number;
    }> {
        const [user, randomCount, customCount, domainCount, recipientCount] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: entitlementSelect() }),
            prisma.alias.count({ where: { userId, organizationId: null, format: "RANDOM" } }),
            prisma.alias.count({ where: { userId, organizationId: null, format: "CUSTOM" } }),
            prisma.domain.count({ where: { userId, organizationId: null } }),
            prisma.recipient.count({ where: { userId, organizationId: null } }),
        ]);

        const limits = getPlanLimits(toLimitsContext(user));

        return {
            excessRandom: excessOver(randomCount, limits.random),
            excessCustom: excessOver(customCount, limits.custom),
            excessDomains: excessOver(domainCount, limits.domains),
            excessRecipients: excessOver(recipientCount, limits.recipients),
        };
    }

    /**
     * Start the downgrade flow for users whose complimentary referral Plus has
     * lapsed. A paid plan's loss is signalled by its provider; referral Plus has
     * no such signal, so without this a referral-only user kept Plus-level
     * resources forever after the window ended.
     *
     * Each lapse is handled once (`referralPlusLapseHandledAt`, cleared by every
     * new referral grant). Users still entitled by a personal or team
     * subscription are only stamped: their own plan's loss starts the flow.
     */
    static async processReferralPlusLapses(): Promise<{ recorded: number; skipped: number; errors: number }> {
        const now = new Date();
        const users = await prisma.user.findMany({
            where: {
                referralPlusUntil: { not: null, lte: now },
                referralPlusLapseHandledAt: null,
            },
            select: { id: true, downgradedAt: true, ...entitlementSelect() },
            take: 200,
        });

        let recorded = 0;
        let skipped = 0;
        let errors = 0;

        for (const user of users) {
            try {
                const stillEntitled =
                    user.subscriptions.some((sub) => isEntitlingSubscription(sub, now.getTime()))
                    || teamSubscriptionsOf(user).length > 0;

                if (!stillEntitled && !user.downgradedAt) {
                    // recordDowngrade, additionally guarded on the window still
                    // being lapsed so a referral grant racing this run wins.
                    const result = await prisma.user.updateMany({
                        where: { id: user.id, downgradedAt: null, referralPlusUntil: { lte: now } },
                        data: { downgradedAt: now },
                    });
                    if (result.count > 0) {
                        recorded++;
                        logger.info("Recorded downgrade for lapsed referral Plus", { userId: user.id });
                    } else {
                        skipped++;
                    }
                } else {
                    skipped++;
                }

                await prisma.user.updateMany({
                    where: { id: user.id, referralPlusUntil: { lte: now }, referralPlusLapseHandledAt: null },
                    data: { referralPlusLapseHandledAt: now },
                });
            } catch (error) {
                errors++;
                logger.error("Failed to handle lapsed referral Plus", error, { userId: user.id });
            }
        }

        if (users.length > 0) {
            logger.info("Referral Plus lapse batch complete", { recorded, skipped, errors });
        }
        return { recorded, skipped, errors };
    }

    // ─── Phase 2: Scheduling ───────────────────────────────────

    /**
     * Schedule excess resources for a single user.
     * Called by processSchedulingBatch at day 30+.
     */
    static async scheduleExcessForUser(userId: string): Promise<void> {
        // Re-verify user is still on free tier
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                downgradedAt: true,
                ...entitlementSelect(),
            },
        });

        if (!user) return;

        if (user.subscriptions.length > 0) {
            // User re-subscribed — cancel downgrade
            await this.cancelDowngrade(userId);
            return;
        }

        // Stripe is still retrying a failed payment: the user may recover, so
        // keep the marker and do not schedule anything yet.
        if (await this.isInDunning(userId, user.downgradedAt)) {
            logger.info("Skipping scheduling — subscription payment is still being retried", { userId });
            return;
        }

        // Complimentary referral Plus still entitles the user. Keep the
        // downgrade marker so scheduling runs against free limits once it
        // lapses, instead of scheduling Plus-entitled resources now.
        if (hasActiveReferralPlus(user)) {
            logger.info("Skipping scheduling — referral Plus is active", { userId });
            return;
        }

        // A team the user belongs to still pays for an entitling plan, and live
        // enforcement grants its limits on the user's personal resources too.
        // Keep the marker (re-evaluated if they leave the team or it lapses)
        // rather than scheduling resources the user is still entitled to.
        if (teamSubscriptionsOf(user).length > 0) {
            logger.info("Skipping scheduling — team subscription still entitles the user", { userId });
            return;
        }

        // Idempotency: skip if any resources already scheduled
        const [scheduledAliases, scheduledDomains, scheduledRecipients] = await Promise.all([
            prisma.alias.count({ where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } } }),
            prisma.domain.count({ where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } } }),
            prisma.recipient.count({ where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } } }),
        ]);

        if (scheduledAliases + scheduledDomains + scheduledRecipients > 0) {
            logger.info("Skipping scheduling — resources already scheduled", { userId });
            return;
        }

        const now = new Date();
        const limits = getPlanLimits(toLimitsContext(user));

        // --- Read phase (outside transaction) ---
        const randomAliases = await prisma.alias.findMany({
            where: { userId, organizationId: null, format: "RANDOM" },
            select: { id: true },
        });
        const customAliases = await prisma.alias.findMany({
            where: { userId, organizationId: null, format: "CUSTOM" },
            select: { id: true },
        });

        const excessRandomCount = excessOver(randomAliases.length, limits.random);
        const excessCustomCount = excessOver(customAliases.length, limits.custom);

        const randomToSchedule = shuffleAndTake(randomAliases, excessRandomCount);
        const customToSchedule = shuffleAndTake(customAliases, excessCustomCount);
        const aliasIdsToSchedule = [
            ...randomToSchedule.map((a) => a.id),
            ...customToSchedule.map((a) => a.id),
        ];

        const personalDomains = await prisma.domain.findMany({
            where: { userId, organizationId: null },
            select: { id: true, domain: true },
        });
        // Only the domains beyond the retained plan's allowance (all of them on
        // free, whose allowance is 0).
        const domainsToSchedule = shuffleAndTake(
            personalDomains,
            excessOver(personalDomains.length, limits.domains),
        );

        const freeRecipientLimit = limits.recipients;
        const recipients = await prisma.recipient.findMany({
            where: { userId, organizationId: null },
            select: { id: true, email: true, isDefault: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        });

        const excessRecipientCount = excessOver(recipients.length, freeRecipientLimit);
        let recipientIdsToSchedule: string[] = [];

        if (excessRecipientCount > 0) {
            const defaultRecipient = recipients.find((r) => r.isDefault) || recipients[0];
            const nonDefault = recipients.filter((r) => r.id !== defaultRecipient?.id);
            const toSchedule = shuffleAndTake(nonDefault, excessRecipientCount);
            recipientIdsToSchedule = toSchedule.map((r) => r.id);
        }

        // If no Alias/Domain/Recipient resources are excessive, keep the
        // downgrade marker through the full Form response-retention grace.
        // Clearing it at the scheduling boundary would shorten Form's grace
        // from 14 days to 7 for Form-only customers.
        const totalScheduled =
            aliasIdsToSchedule.length + domainsToSchedule.length + recipientIdsToSchedule.length;

        if (totalScheduled === 0) {
            const formGraceMs = (DOWNGRADE_SCHEDULING_DELAY_DAYS + DOWNGRADE_DELETION_DELAY_DAYS) * DAY_MS;
            if (
                user.downgradedAt
                && user.downgradedAt.getTime() + formGraceMs > now.getTime()
            ) {
                logger.info("User within free resource limits — retaining Form downgrade grace", { userId });
                return;
            }
            await prisma.user.update({
                where: { id: userId },
                data: { downgradedAt: null },
            });
            logger.info("User within free limits — cleared downgrade", { userId });
            return;
        }

        // --- Write phase (atomic transaction) ---
        await prisma.$transaction(async (tx) => {
            if (aliasIdsToSchedule.length > 0) {
                await tx.alias.updateMany({
                    where: { id: { in: aliasIdsToSchedule } },
                    data: { scheduledForRemovalAt: now },
                });
            }

            if (domainsToSchedule.length > 0) {
                await tx.domain.updateMany({
                    where: { id: { in: domainsToSchedule.map((d) => d.id) } },
                    data: { scheduledForRemovalAt: now },
                });
            }

            if (recipientIdsToSchedule.length > 0) {
                await tx.recipient.updateMany({
                    where: { id: { in: recipientIdsToSchedule } },
                    data: { scheduledForRemovalAt: now },
                });
            }
        });

        // Send scheduling email
        try {
            // Fetch scheduled alias details for the email
            const scheduledAliasDetails = aliasIdsToSchedule.length > 0
                ? await prisma.alias.findMany({
                    where: { id: { in: aliasIdsToSchedule } },
                    select: { email: true, format: true },
                })
                : [];

            const deletionDate = new Date(now);
            deletionDate.setDate(deletionDate.getDate() + DOWNGRADE_DELETION_DELAY_DAYS);

            const { sendResourcesScheduledForRemovalEmail } = await import("@/lib/resend");
            await sendResourcesScheduledForRemovalEmail(user.email, {
                aliases: scheduledAliasDetails.map((a) => ({ email: a.email, format: a.format })),
                domains: domainsToSchedule.map((d) => d.domain),
                recipients: recipientIdsToSchedule.length > 0
                    ? (await prisma.recipient.findMany({
                        where: { id: { in: recipientIdsToSchedule } },
                        select: { email: true },
                    })).map((r) => r.email)
                    : [],
            }, deletionDate);
        } catch (error) {
            logger.error("Failed to send scheduling email", error, { userId });
        }

        logger.info("Scheduled excess resources for removal", {
            userId,
            aliases: aliasIdsToSchedule.length,
            domains: domainsToSchedule.length,
            recipients: recipientIdsToSchedule.length,
        });
    }

    /**
     * Process a batch of users who need scheduling (day 30+).
     */
    static async processSchedulingBatch(): Promise<{ processed: number; errors: number }> {
        const schedulingCutoff = new Date();
        schedulingCutoff.setDate(schedulingCutoff.getDate() - DOWNGRADE_SCHEDULING_DELAY_DAYS);

        // Find users who: have downgradedAt set, are past 30 days, still on free tier,
        // and have no resources with scheduledForRemovalAt set
        const users = await prisma.user.findMany({
            where: {
                downgradedAt: { not: null, lte: schedulingCutoff },
                subscriptions: {
                    none: {
                        organizationId: null,
                        status: { in: ["active", "trialing"] },
                    },
                },
                // Team members keep the team's limits on personal resources
                // (live enforcement inherits org subscriptions); like referral
                // Plus holders they are retried once that entitlement ends.
                ...noTeamEntitlementWhere(),
                // Referral Plus holders are retried once it lapses; selecting
                // them daily would only crowd out actionable users.
                OR: [
                    { referralPlusUntil: null },
                    { referralPlusUntil: { lte: new Date() } },
                ],
                // Exclude users who already have resources scheduled, and
                // users whose payment Stripe is still retrying (bounded).
                AND: [
                    {
                        OR: [
                            { downgradedAt: { lte: new Date(Date.now() - MAX_DUNNING_DAYS * DAY_MS) } },
                            { subscriptions: { none: dunningSubscriptionWhere } },
                        ],
                    },
                    { aliases: { none: { scheduledForRemovalAt: { not: null }, organizationId: null } } },
                    { domains: { none: { scheduledForRemovalAt: { not: null }, organizationId: null } } },
                    { recipients: { none: { scheduledForRemovalAt: { not: null }, organizationId: null } } },
                ],
            },
            select: { id: true },
            take: 100,
        });

        let processed = 0;
        let errors = 0;

        for (const user of users) {
            try {
                await this.scheduleExcessForUser(user.id);
                processed++;
            } catch (error) {
                errors++;
                logger.error("Failed to schedule excess for user", error, { userId: user.id });
            }
        }

        logger.info("Scheduling batch complete", { processed, errors });
        return { processed, errors };
    }

    // ─── Phase 3: Deletion ─────────────────────────────────────

    /**
     * Delete scheduled resources for a single user.
     * Re-checks current plan limits (handles re-subscription between phase 2 and 3).
     */
    static async deleteScheduledForUser(userId: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                ...entitlementSelect(),
            },
        });

        if (!user) return;

        const limitsContext = toLimitsContext(user);
        const planLimits = getPlanLimits(limitsContext);
        const dropLimits = getDropLimits(limitsContext);
        const recipientLimit = getRecipientLimit(limitsContext);

        // --- Drop cleanup: delete excess storage (oldest first) ---
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { storageUsed: true },
        });

        const maxStorage = BigInt(dropLimits.maxStorage);
        const storageUsed = userRecord?.storageUsed ?? BigInt(0);

        if (storageUsed > maxStorage) {
            // Find drops ordered oldest first, delete until under quota
            const drops = await prisma.drop.findMany({
                where: { userId, organizationId: null, deletedAt: null },
                select: { id: true },
                orderBy: { createdAt: "asc" },
            });

            let currentStorage = storageUsed;
            for (const drop of drops) {
                if (currentStorage <= maxStorage) break;

                // Mark and claim first. A concurrent loser receives no files and
                // therefore cannot delete storage created by a pending completion.
                const claim = await deleteDropFilesAndReleaseQuota(drop.id);

                // Delete files from S3
                for (const file of claim.files) {
                    if (file.s3UploadId) {
                        await abortMultipartUpload(file.storageKey, file.s3UploadId).catch(() => undefined);
                    }
                    try {
                        await deleteObject(file.storageKey);
                    } catch (e) {
                        logger.error("Failed to delete drop file from storage during downgrade", e, { storageKey: file.storageKey });
                        // The user should not remain charged for a logically
                        // deleted drop because R2 cleanup was transiently
                        // unavailable. Track the physical orphan for cron.
                        try {
                            await prisma.orphanedFile.create({ data: { storageKey: file.storageKey } });
                        } catch (orphanError) {
                            logger.error("Failed to record downgrade storage orphan", orphanError, { storageKey: file.storageKey });
                        }
                    }
                }

                // Atomically mark the drop deleted, claim its file rows, and
                // release their quota. Later cleanup sees no file rows, so it
                // cannot subtract these bytes a second time.
                // Re-read the counter instead of subtracting the stale selected
                // size: uploads and other cleanup jobs may be running at the
                // same time, and the atomic claim above is the source of truth.
                const refreshedUser = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { storageUsed: true },
                });
                currentStorage = refreshedUser?.storageUsed ?? BigInt(0);
            }
        }

        // --- Read phase (outside transaction) ---
        const allRandomAliases = await prisma.alias.count({ where: { userId, organizationId: null, format: "RANDOM" } });
        const allCustomAliases = await prisma.alias.count({ where: { userId, organizationId: null, format: "CUSTOM" } });

        const currentRandomExcess = planLimits.random === -1 ? 0 : Math.max(0, allRandomAliases - planLimits.random);
        const currentCustomExcess = planLimits.custom === -1 ? 0 : Math.max(0, allCustomAliases - planLimits.custom);

        const scheduledRandomAliases = await prisma.alias.findMany({
            where: { userId, organizationId: null, format: "RANDOM", scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });
        const scheduledCustomAliases = await prisma.alias.findMany({
            where: { userId, organizationId: null, format: "CUSTOM", scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });

        const randomToDelete = scheduledRandomAliases.slice(0, currentRandomExcess);
        const customToDelete = scheduledCustomAliases.slice(0, currentCustomExcess);

        const aliasSparedIds = [
            ...scheduledRandomAliases.slice(randomToDelete.length).map((a) => a.id),
            ...scheduledCustomAliases.slice(customToDelete.length).map((a) => a.id),
        ];

        const domainLimit = planLimits.domains;
        const allDomains = await prisma.domain.count({ where: { userId, organizationId: null } });
        const currentDomainExcess = excessOver(allDomains, domainLimit);

        const scheduledDomains = await prisma.domain.findMany({
            where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } },
            select: { id: true, domain: true },
        });

        const domainsToDelete = scheduledDomains.slice(0, currentDomainExcess);
        const domainSparedIds = scheduledDomains.slice(domainsToDelete.length).map((d) => d.id);

        const allRecipients = await prisma.recipient.findMany({
            where: { userId, organizationId: null },
            select: { id: true, isDefault: true },
        });
        const currentRecipientExcess = excessOver(allRecipients.length, recipientLimit);

        const scheduledRecipients = await prisma.recipient.findMany({
            where: { userId, organizationId: null, scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });

        const recipientsToDelete = scheduledRecipients.slice(0, currentRecipientExcess);
        const recipientSparedIds = scheduledRecipients.slice(recipientsToDelete.length).map((r) => r.id);
        const recipientIdsToDelete = recipientsToDelete.map((r) => r.id);

        // Aliases routed to a deleted recipient are repointed here so they keep
        // forwarding: the default recipient (never scheduled), else any survivor.
        const survivingRecipients = allRecipients.filter((r) => !recipientIdsToDelete.includes(r.id));
        const fallbackRecipientId =
            (survivingRecipients.find((r) => r.isDefault) ?? survivingRecipients[0])?.id ?? null;

        // Aliases removed because their custom domain was deleted. Counted in
        // the transaction (after the explicit alias deletes, so no overlap).
        let domainAliasesDeleted = 0;

        // --- Write phase (atomic transaction) ---
        await prisma.$transaction(async (tx) => {
            if (randomToDelete.length > 0) {
                await tx.alias.deleteMany({
                    where: { id: { in: randomToDelete.map((a) => a.id) } },
                });
            }
            if (customToDelete.length > 0) {
                await tx.alias.deleteMany({
                    where: { id: { in: customToDelete.map((a) => a.id) } },
                });
            }
            if (aliasSparedIds.length > 0) {
                await tx.alias.updateMany({
                    where: { id: { in: aliasSparedIds } },
                    data: { scheduledForRemovalAt: null },
                });
            }

            if (domainsToDelete.length > 0) {
                // Mirror DomainService.deleteDomain: a domain's aliases go with
                // it, scoped to this user's personal resources.
                const domainAliases = await tx.alias.deleteMany({
                    where: {
                        userId,
                        organizationId: null,
                        domain: { in: domainsToDelete.map((d) => d.domain) },
                    },
                });
                domainAliasesDeleted = domainAliases?.count ?? 0;
                await tx.domain.deleteMany({
                    where: { id: { in: domainsToDelete.map((d) => d.id) } },
                });
            }
            if (domainSparedIds.length > 0) {
                await tx.domain.updateMany({
                    where: { id: { in: domainSparedIds } },
                    data: { scheduledForRemovalAt: null },
                });
            }

            if (recipientIdsToDelete.length > 0) {
                if (fallbackRecipientId) {
                    await reassignAliasesFromRecipients(tx, recipientIdsToDelete, fallbackRecipientId);
                }
                await tx.recipient.deleteMany({
                    where: { id: { in: recipientIdsToDelete } },
                });
            }
            if (recipientSparedIds.length > 0) {
                await tx.recipient.updateMany({
                    where: { id: { in: recipientSparedIds } },
                    data: { scheduledForRemovalAt: null },
                });
            }

            await tx.user.update({
                where: { id: userId },
                data: { downgradedAt: null },
            });
        });

        // --- Post-transaction: send confirmation email ---
        const aliasesDeleted = randomToDelete.length + customToDelete.length + domainAliasesDeleted;
        const domainsDeleted = domainsToDelete.length;
        const recipientsDeleted = recipientsToDelete.length;
        const sparedCount = aliasSparedIds.length + domainSparedIds.length + recipientSparedIds.length;

        const totalDeleted = aliasesDeleted + domainsDeleted + recipientsDeleted;
        if (totalDeleted > 0) {
            try {
                const { sendResourcesDeletedEmail } = await import("@/lib/resend");
                await sendResourcesDeletedEmail(user.email, {
                    aliasesDeleted,
                    domainsDeleted,
                    recipientsDeleted,
                    sparedCount,
                });
            } catch (error) {
                logger.error("Failed to send deletion email", error, { userId });
            }
        }

        logger.info("Deleted scheduled resources", {
            userId,
            aliasesDeleted,
            domainsDeleted,
            recipientsDeleted,
            sparedCount,
        });
    }

    /**
     * Process a batch of users who have resources past the 14-day deletion window.
     */
    static async processDeletionBatch(): Promise<{ processed: number; errors: number }> {
        const deletionCutoff = new Date();
        deletionCutoff.setDate(deletionCutoff.getDate() - DOWNGRADE_DELETION_DELAY_DAYS);

        // Find distinct users who have any resource scheduled for removal past the window
        const usersWithScheduledAliases = await prisma.alias.findMany({
            where: { scheduledForRemovalAt: { not: null, lte: deletionCutoff }, organizationId: null },
            select: { userId: true },
            distinct: ["userId"],
        });

        const usersWithScheduledDomains = await prisma.domain.findMany({
            where: { scheduledForRemovalAt: { not: null, lte: deletionCutoff }, userId: { not: null }, organizationId: null },
            select: { userId: true },
            distinct: ["userId"],
        });

        const usersWithScheduledRecipients = await prisma.recipient.findMany({
            where: { scheduledForRemovalAt: { not: null, lte: deletionCutoff }, organizationId: null },
            select: { userId: true },
            distinct: ["userId"],
        });

        // Deduplicate user IDs (null userId = org-owned row whose creator was
        // deleted — no personal user to notify/reclaim against, so skip).
        const userIdSet = new Set<string>();
        for (const r of usersWithScheduledAliases) if (r.userId) userIdSet.add(r.userId);
        for (const r of usersWithScheduledDomains) if (r.userId) userIdSet.add(r.userId);
        for (const r of usersWithScheduledRecipients) if (r.userId) userIdSet.add(r.userId);

        const userIds = Array.from(userIdSet).slice(0, 100);

        let processed = 0;
        let errors = 0;

        for (const userId of userIds) {
            try {
                await this.deleteScheduledForUser(userId);
                processed++;
            } catch (error) {
                errors++;
                logger.error("Failed to delete scheduled resources for user", error, { userId });
            }
        }

        logger.info("Deletion batch complete", { processed, errors });
        return { processed, errors };
    }
}
