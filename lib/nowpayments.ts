import "server-only"
import crypto from "crypto"
import { z } from "zod"
import { createLogger } from "@/lib/logger"

const logger = createLogger("NOWPayments")

const NOWPAYMENTS_API_URL = "https://api.nowpayments.io/v1"

interface CreateInvoiceParams {
    priceAmount: number
    priceCurrency?: string
    orderId: string
    orderDescription: string
    ipnCallbackUrl: string
    successUrl: string
    cancelUrl: string
}

const invoiceResponseSchema = z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    invoice_url: z.url(),
}).passthrough()

type InvoiceResponse = z.infer<typeof invoiceResponseSchema>

export class NOWPaymentsClient {
    private apiKey: string

    constructor() {
        const apiKey = process.env.NOWPAYMENTS_API_KEY
        if (!apiKey) {
            throw new Error("NOWPAYMENTS_API_KEY is required")
        }
        this.apiKey = apiKey
    }

    async createInvoice(params: CreateInvoiceParams): Promise<InvoiceResponse> {
        const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
            method: "POST",
            headers: {
                "x-api-key": this.apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                price_amount: params.priceAmount,
                price_currency: params.priceCurrency || "usd",
                order_id: params.orderId,
                order_description: params.orderDescription,
                ipn_callback_url: params.ipnCallbackUrl,
                success_url: params.successUrl,
                cancel_url: params.cancelUrl,
            }),
            signal: AbortSignal.timeout(10_000),
        })

        if (!response.ok) {
            const error = await response.text()
            logger.error("Failed to create invoice", new Error(error))
            throw new Error(`NOWPayments API error: ${response.status}`)
        }

        const payload = await response.json().catch(() => null)
        const parsed = invoiceResponseSchema.safeParse(payload)
        if (!parsed.success) {
            logger.error("NOWPayments returned an invalid invoice response", parsed.error)
            throw new Error("NOWPayments returned an invalid invoice response")
        }

        return parsed.data
    }

    /**
     * Verify IPN webhook signature using HMAC-SHA512.
     * NOWPayments requires sorting the payload keys alphabetically before hashing.
     */
    static verifyIPNSignature(payload: Record<string, unknown>, signature: string): boolean {
        const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
        if (!ipnSecret) {
            logger.error("NOWPAYMENTS_IPN_SECRET is not configured")
            return false
        }

        const sorted = sortObject(payload)
        const hmac = crypto.createHmac("sha512", ipnSecret)
        hmac.update(JSON.stringify(sorted))
        const expectedSignature = hmac.digest("hex")

        try {
            const sigBuffer = Buffer.from(signature, "hex")
            const expectedBuffer = Buffer.from(expectedSignature, "hex")

            if (sigBuffer.length !== expectedBuffer.length) {
                return false
            }

            return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
        } catch {
            return false
        }
    }
}

/**
 * Recursively sort object keys alphabetically (required by NOWPayments IPN spec).
 */
function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(obj).sort()

    for (const key of keys) {
        const value = obj[key]
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            sorted[key] = sortObject(value as Record<string, unknown>)
        } else {
            sorted[key] = value
        }
    }

    return sorted
}

// Lazy singleton to avoid startup crash when env vars are not set
let _client: NOWPaymentsClient | null = null

export function getNOWPaymentsClient(): NOWPaymentsClient {
    if (!_client) {
        _client = new NOWPaymentsClient()
    }
    return _client
}
