import { prisma } from "@/lib/prisma"

export async function createCryptoPayment(data: {
    nowPaymentId: string
    invoiceId: string
    orderId: string
    payAmount: number
    payCurrency: string
    priceAmount: number
    priceCurrency: string
    product: string
    tier: string
    planPriceId: string
    status: string
    userId: string
}) {
    return await prisma.cryptoPayment.create({
        data,
    })
}

type RecoverableCryptoInvoice = {
    id: string
    orderId: string
    userId: string
    product: string
    tier: string
    priceAmount: number
    payCurrency: string
    createdAt: Date
    status: "waiting" | "expired"
    user: { email: string } | null
}

/**
 * Returns recoverable `waiting` and `expired` crypto invoices in the given
 * window. Expired rows stay eligible until their notification is durably
 * deduplicated, so a transient email failure can be retried on the next run.
 *
 * Handled rows are deduplicated in Redis rather than the DB, so they stay in
 * the window for up to 30 days. The batch is therefore filled from both ends:
 * the oldest `waiting` invoices first (expiry candidates, which would starve
 * behind newer rows), then the newest invoices (fresh reminders, which would
 * starve behind old handled rows under oldest-first).
 */
export async function getRecoverableCryptoInvoices(opts: {
    createdBefore: Date;
    createdAfter: Date;
    limit: number;
}): Promise<RecoverableCryptoInvoice[]> {
    const where = {
        status: { in: ["waiting", "expired"] },
        createdAt: { gte: opts.createdAfter, lt: opts.createdBefore },
    }
    const include = { user: { select: { email: true } } }
    const [oldestWaiting, newest] = await Promise.all([
        prisma.cryptoPayment.findMany({
            where: { ...where, status: "waiting" },
            include,
            orderBy: { createdAt: "asc" },
            take: Math.ceil(opts.limit / 2),
        }),
        prisma.cryptoPayment.findMany({
            where,
            include,
            orderBy: { createdAt: "desc" },
            take: opts.limit,
        }),
    ])

    const seen = new Set<string>()
    const rows = [...oldestWaiting, ...newest].filter((row) => {
        if (seen.has(row.id)) return false
        seen.add(row.id)
        return true
    })
    return rows.slice(0, opts.limit) as RecoverableCryptoInvoice[]
}

/**
 * Marks a stuck crypto invoice as expired. Guarded by the current status so
 * a late IPN that flipped the row to `finished` won't get overwritten.
 */
export async function expireCryptoInvoice(id: string) {
    return await prisma.cryptoPayment.updateMany({
        where: { id, status: "waiting" },
        data: { status: "expired" },
    })
}
