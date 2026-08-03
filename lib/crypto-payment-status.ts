const NOWPAYMENTS_PAYMENT_STATUSES = [
    "waiting",
    "confirming",
    "confirmed",
    "sending",
    "partially_paid",
    "finished",
    "failed",
    "refunded",
    "expired",
] as const

export type NowPaymentsPaymentStatus = (typeof NOWPAYMENTS_PAYMENT_STATUSES)[number]

export function isNowPaymentsPaymentStatus(value: unknown): value is NowPaymentsPaymentStatus {
    return typeof value === "string"
        && NOWPAYMENTS_PAYMENT_STATUSES.some((status) => status === value)
}

const INTERNAL_CRYPTO_FAILURE_STATUSES = ["underpaid", "price_mismatch"] as const

export type InternalCryptoFailureStatus = (typeof INTERNAL_CRYPTO_FAILURE_STATUSES)[number]

export function isInternalCryptoFailureStatus(value: unknown): value is InternalCryptoFailureStatus {
    return typeof value === "string"
        && INTERNAL_CRYPTO_FAILURE_STATUSES.some((status) => status === value)
}
