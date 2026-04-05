/**
 * Billing Downgrade Service
 *
 * Handles graduated resource removal when a user's subscription ends.
 * Three phases:
 *   Phase 1 (day 0):  Record downgrade, send warning email
 *   Phase 2 (day 30): Schedule excess resources for removal
 *   Phase 3 (day 44): Delete scheduled resources
 */

import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { getPlanLimits, getDropLimits, getRecipientLimit } from "@/lib/limits";
import { ALIAS_LIMITS } from "@/config/plans";
import { DOWNGRADE_SCHEDULING_DELAY_DAYS, DOWNGRADE_DELETION_DELAY_DAYS } from "@/lib/constants";
import { deleteObject } from "@/lib/storage";

const logger = createLogger("BillingDowngrade");

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
        const [, aliases, domains, recipients] = await prisma.$transaction([
            prisma.user.update({
                where: { id: userId },
                data: { downgradedAt: null },
            }),
            prisma.alias.updateMany({
                where: { userId, scheduledForRemovalAt: { not: null } },
                data: { scheduledForRemovalAt: null },
            }),
            prisma.domain.updateMany({
                where: { userId, scheduledForRemovalAt: { not: null } },
                data: { scheduledForRemovalAt: null },
            }),
            prisma.recipient.updateMany({
                where: { userId, scheduledForRemovalAt: { not: null } },
                data: { scheduledForRemovalAt: null },
            }),
        ]);

        const total = aliases.count + domains.count + recipients.count;
        if (total > 0) {
            logger.info("Cancelled downgrade and unscheduled resources", {
                userId,
                unscheduled: { aliases: aliases.count, domains: domains.count, recipients: recipients.count },
            });
        }
    }

    // ─── Phase 1 helpers ───────────────────────────────────────

    /**
     * Calculate how many excess resources a user has relative to free-tier limits.
     */
    static async calculateExcess(userId: string): Promise<{
        excessRandom: number;
        excessCustom: number;
        excessDomains: number;
        excessRecipients: number;
    }> {
        const [randomCount, customCount, domainCount, recipientCount] = await Promise.all([
            prisma.alias.count({ where: { userId, format: "RANDOM" } }),
            prisma.alias.count({ where: { userId, format: "CUSTOM" } }),
            prisma.domain.count({ where: { userId } }),
            prisma.recipient.count({ where: { userId } }),
        ]);

        const freeLimits = ALIAS_LIMITS.free;

        return {
            excessRandom: Math.max(0, randomCount - freeLimits.random),
            excessCustom: Math.max(0, customCount - freeLimits.custom),
            excessDomains: Math.max(0, domainCount - freeLimits.domains),
            excessRecipients: Math.max(0, recipientCount - freeLimits.recipients),
        };
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
            select: { id: true, email: true, stripePriceId: true, downgradedAt: true },
        });

        if (!user) return;

        if (user.stripePriceId !== null) {
            // User re-subscribed — cancel downgrade
            await this.cancelDowngrade(userId);
            return;
        }

        // Idempotency: skip if any resources already scheduled
        const [scheduledAliases, scheduledDomains, scheduledRecipients] = await Promise.all([
            prisma.alias.count({ where: { userId, scheduledForRemovalAt: { not: null } } }),
            prisma.domain.count({ where: { userId, scheduledForRemovalAt: { not: null } } }),
            prisma.recipient.count({ where: { userId, scheduledForRemovalAt: { not: null } } }),
        ]);

        if (scheduledAliases + scheduledDomains + scheduledRecipients > 0) {
            logger.info("Skipping scheduling — resources already scheduled", { userId });
            return;
        }

        const now = new Date();
        const freeLimits = ALIAS_LIMITS.free;

        // --- Read phase (outside transaction) ---
        const randomAliases = await prisma.alias.findMany({
            where: { userId, format: "RANDOM" },
            select: { id: true },
        });
        const customAliases = await prisma.alias.findMany({
            where: { userId, format: "CUSTOM" },
            select: { id: true },
        });

        const excessRandomCount = Math.max(0, randomAliases.length - freeLimits.random);
        const excessCustomCount = Math.max(0, customAliases.length - freeLimits.custom);

        const randomToSchedule = shuffleAndTake(randomAliases, excessRandomCount);
        const customToSchedule = shuffleAndTake(customAliases, excessCustomCount);
        const aliasIdsToSchedule = [
            ...randomToSchedule.map((a) => a.id),
            ...customToSchedule.map((a) => a.id),
        ];

        const domainsToSchedule = await prisma.domain.findMany({
            where: { userId },
            select: { id: true, domain: true },
        });

        const freeRecipientLimit = freeLimits.recipients;
        const recipients = await prisma.recipient.findMany({
            where: { userId },
            select: { id: true, email: true, isDefault: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        });

        const excessRecipientCount = Math.max(0, recipients.length - freeRecipientLimit);
        let recipientIdsToSchedule: string[] = [];

        if (excessRecipientCount > 0) {
            const defaultRecipient = recipients.find((r) => r.isDefault) || recipients[0];
            const nonDefault = recipients.filter((r) => r.id !== defaultRecipient?.id);
            const toSchedule = shuffleAndTake(nonDefault, excessRecipientCount);
            recipientIdsToSchedule = toSchedule.map((r) => r.id);
        }

        // If no excess across all resource types: clear downgradedAt
        const totalScheduled =
            aliasIdsToSchedule.length + domainsToSchedule.length + recipientIdsToSchedule.length;

        if (totalScheduled === 0) {
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
                stripePriceId: null,
                // Exclude users who already have resources scheduled
                AND: [
                    { aliases: { none: { scheduledForRemovalAt: { not: null } } } },
                    { domains: { none: { scheduledForRemovalAt: { not: null } } } },
                    { recipients: { none: { scheduledForRemovalAt: { not: null } } } },
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
                stripePriceId: true,
                stripeCurrentPeriodEnd: true,
            },
        });

        if (!user) return;

        const planLimits = getPlanLimits(user);
        const dropLimits = getDropLimits(user);
        const recipientLimit = getRecipientLimit(user);

        // --- Drop cleanup: delete excess storage (oldest first) ---
        const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { storageUsed: true },
        });

        const maxStorage = BigInt(dropLimits.maxStorage);
        const storageUsed = userRecord?.storageUsed ?? BigInt(0);
        let dropsDeleted = 0;

        if (storageUsed > maxStorage) {
            // Find drops ordered oldest first, delete until under quota
            const drops = await prisma.drop.findMany({
                where: { userId, deletedAt: null },
                include: { files: { select: { id: true, storageKey: true, size: true } } },
                orderBy: { createdAt: "asc" },
            });

            let currentStorage = storageUsed;
            for (const drop of drops) {
                if (currentStorage <= maxStorage) break;

                // @ts-expect-error - Prisma dynamic include types get lost in the for...of loop
                const dropFiles = drop.files;
                const dropSize = dropFiles.reduce((sum: bigint, f: { size: bigint }) => sum + f.size, BigInt(0));

                // Delete files from S3
                for (const file of dropFiles) {
                    try {
                        await deleteObject(file.storageKey);
                    } catch (e) {
                        logger.error("Failed to delete drop file from storage during downgrade", e, { fileId: file.id });
                    }
                }

                // Soft-delete the drop
                await prisma.drop.update({
                    where: { id: drop.id },
                    data: { deletedAt: new Date() },
                });

                currentStorage -= dropSize;
                dropsDeleted++;
            }

            // Update storageUsed to reflect actual remaining storage
            if (dropsDeleted > 0) {
                const remainingStorage = await prisma.dropFile.aggregate({
                    where: { drop: { userId, deletedAt: null } },
                    _sum: { size: true },
                });
                await prisma.user.update({
                    where: { id: userId },
                    data: { storageUsed: remainingStorage._sum.size ?? BigInt(0) },
                });
            }
        }

        // --- Read phase (outside transaction) ---
        const allRandomAliases = await prisma.alias.count({ where: { userId, format: "RANDOM" } });
        const allCustomAliases = await prisma.alias.count({ where: { userId, format: "CUSTOM" } });

        const currentRandomExcess = Math.max(0, allRandomAliases - planLimits.random);
        const currentCustomExcess = Math.max(0, allCustomAliases - planLimits.custom);

        const scheduledRandomAliases = await prisma.alias.findMany({
            where: { userId, format: "RANDOM", scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });
        const scheduledCustomAliases = await prisma.alias.findMany({
            where: { userId, format: "CUSTOM", scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });

        const randomToDelete = scheduledRandomAliases.slice(0, currentRandomExcess);
        const customToDelete = scheduledCustomAliases.slice(0, currentCustomExcess);

        const aliasSparedIds = [
            ...scheduledRandomAliases.slice(randomToDelete.length).map((a) => a.id),
            ...scheduledCustomAliases.slice(customToDelete.length).map((a) => a.id),
        ];

        const domainLimit = planLimits.domains;
        const allDomains = await prisma.domain.count({ where: { userId } });
        const currentDomainExcess = Math.max(0, allDomains - domainLimit);

        const scheduledDomains = await prisma.domain.findMany({
            where: { userId, scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });

        const domainsToDelete = scheduledDomains.slice(0, currentDomainExcess);
        const domainSparedIds = scheduledDomains.slice(domainsToDelete.length).map((d) => d.id);

        const allRecipients = await prisma.recipient.findMany({
            where: { userId },
            select: { id: true, isDefault: true },
        });
        const currentRecipientExcess = Math.max(0, allRecipients.length - recipientLimit);

        const scheduledRecipients = await prisma.recipient.findMany({
            where: { userId, scheduledForRemovalAt: { not: null } },
            select: { id: true },
        });

        const recipientsToDelete = scheduledRecipients.slice(0, currentRecipientExcess);
        const recipientSparedIds = scheduledRecipients.slice(recipientsToDelete.length).map((r) => r.id);

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

            if (recipientsToDelete.length > 0) {
                await tx.recipient.deleteMany({
                    where: { id: { in: recipientsToDelete.map((r) => r.id) } },
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
        const aliasesDeleted = randomToDelete.length + customToDelete.length;
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
            where: { scheduledForRemovalAt: { not: null, lte: deletionCutoff } },
            select: { userId: true },
            distinct: ["userId"],
        });

        const usersWithScheduledDomains = await prisma.domain.findMany({
            where: { scheduledForRemovalAt: { not: null, lte: deletionCutoff }, userId: { not: null } },
            select: { userId: true },
            distinct: ["userId"],
        });

        const usersWithScheduledRecipients = await prisma.recipient.findMany({
            where: { scheduledForRemovalAt: { not: null, lte: deletionCutoff } },
            select: { userId: true },
            distinct: ["userId"],
        });

        // Deduplicate user IDs
        const userIdSet = new Set<string>();
        for (const r of usersWithScheduledAliases) userIdSet.add(r.userId);
        for (const r of usersWithScheduledDomains) if (r.userId) userIdSet.add(r.userId);
        for (const r of usersWithScheduledRecipients) userIdSet.add(r.userId);

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
