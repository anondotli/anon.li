import "server-only"

import { getActivePromotion, type Promotion } from "@/config/promotions"
import { isPayingCustomer } from "@/lib/data/user"

/**
 * The promotion to advertise to this viewer, or null. Paying customers never
 * see promotions; signed-out viewers see whatever is running. The database is
 * only consulted while a promotion is running, so this is free otherwise.
 */
export async function getPromotionForUser(
    userId: string | null | undefined,
    now: number = Date.now(),
): Promise<Promotion | null> {
    const promotion = getActivePromotion(now)
    if (!promotion || !userId) return promotion
    return (await isPayingCustomer(userId, now)) ? null : promotion
}
