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

type WaitingCryptoInvoice = {
    id: string
    userId: string
    product: string
    tier: string
    priceAmount: number
    payCurrency: string
    createdAt: Date
    user: { email: string } | null
}

/**
 * Returns `waiting` crypto invoices whose creation time is within the given window.
 * Joins the user's email so the cron can fire a reminder without a second query.
 */
export async function getWaitingCryptoInvoices(opts: {
    createdBefore: Date;
    createdAfter: Date;
    limit: number;
}): Promise<WaitingCryptoInvoice[]> {
    const rows = await prisma.cryptoPayment.findMany({
        where: {
            status: "waiting",
            createdAt: { gte: opts.createdAfter, lt: opts.createdBefore },
        },
        include: {
            user: { select: { email: true } },
        },
        orderBy: { createdAt: "asc" },
        take: opts.limit,
    })
    return rows as unknown as WaitingCryptoInvoice[]
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
