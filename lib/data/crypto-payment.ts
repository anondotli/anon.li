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