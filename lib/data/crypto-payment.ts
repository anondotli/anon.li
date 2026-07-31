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
 */
export async function getRecoverableCryptoInvoices(opts: {
    createdBefore: Date;
    createdAfter: Date;
    limit: number;
}): Promise<RecoverableCryptoInvoice[]> {
    const rows = await prisma.cryptoPayment.findMany({
        where: {
            status: { in: ["waiting", "expired"] },
            createdAt: { gte: opts.createdAfter, lt: opts.createdBefore },
        },
        include: {
            user: { select: { email: true } },
        },
        orderBy: { createdAt: "asc" },
        take: opts.limit,
    })
    return rows as RecoverableCryptoInvoice[]
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
