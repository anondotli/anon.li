import "server-only"
import { createLogger } from "@/lib/logger"

const logger = createLogger("FX")

// ECB euro reference rates, published once per working day (~16:00 CET).
// Quoted as units of foreign currency per 1 EUR.
const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

let cached: { eurPerUsd: number; fetchedAt: number } | null = null

/**
 * EUR per 1 USD from the ECB daily reference rate, or null when it has never
 * been fetched successfully. Cached in memory per instance; a failed refresh
 * keeps serving the last good rate.
 */
export async function getUsdToEurRate(): Promise<number | null> {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.eurPerUsd

    try {
        const res = await fetch(ECB_DAILY_URL, {
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
        })
        if (!res.ok) throw new Error(`ECB responded with ${res.status}`)

        const xml = await res.text()
        const match = /currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/.exec(xml)
        const usdPerEur = match ? Number(match[1]) : NaN
        if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) {
            throw new Error("ECB feed has no valid USD rate")
        }

        cached = { eurPerUsd: 1 / usdPerEur, fetchedAt: Date.now() }
        return cached.eurPerUsd
    } catch (error) {
        logger.warn("USD to EUR rate unavailable", error)
        return cached?.eurPerUsd ?? null
    }
}
