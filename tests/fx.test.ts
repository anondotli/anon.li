/**
 * USD→EUR reference rate: parsed from the ECB daily feed, cached per instance,
 * and a failed refresh keeps serving the last good rate.
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ECB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
    <Cube>
        <Cube time='2026-10-15'>
            <Cube currency='USD' rate='1.25'/>
            <Cube currency='JPY' rate='177.06'/>
        </Cube>
    </Cube>
</gesmes:Envelope>`

const fetchMock = vi.fn()

async function loadFx() {
    const { getUsdToEurRate } = await import("@/lib/fx")
    return getUsdToEurRate
}

describe("getUsdToEurRate", () => {
    beforeEach(() => {
        vi.resetModules()
        fetchMock.mockReset()
        vi.stubGlobal("fetch", fetchMock)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("inverts the ECB USD quote into EUR per USD", async () => {
        fetchMock.mockResolvedValue(new Response(ECB_XML))
        const getUsdToEurRate = await loadFx()

        expect(await getUsdToEurRate()).toBeCloseTo(0.8, 10)
    })

    it("serves the cached rate without refetching", async () => {
        fetchMock.mockResolvedValue(new Response(ECB_XML))
        const getUsdToEurRate = await loadFx()

        await getUsdToEurRate()
        await getUsdToEurRate()

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("keeps the last good rate when a refresh fails", async () => {
        vi.useFakeTimers()
        fetchMock.mockResolvedValueOnce(new Response(ECB_XML))
        const getUsdToEurRate = await loadFx()
        await getUsdToEurRate()

        vi.advanceTimersByTime(7 * 60 * 60 * 1000)
        fetchMock.mockRejectedValueOnce(new Error("network down"))

        expect(await getUsdToEurRate()).toBeCloseTo(0.8, 10)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("returns null when no rate has ever been fetched", async () => {
        fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }))
        const getUsdToEurRate = await loadFx()

        expect(await getUsdToEurRate()).toBeNull()
    })

    it("returns null when the feed has no usable USD rate", async () => {
        fetchMock.mockResolvedValue(new Response(ECB_XML.replace("rate='1.25'", "rate='0'")))
        const getUsdToEurRate = await loadFx()

        expect(await getUsdToEurRate()).toBeNull()
    })
})
