/**
 * @vitest-environment jsdom
 *
 * Vault sync messages are for other tabs only. BroadcastChannel also delivers
 * to other channel instances in the sending document, so without filtering a
 * tab reacted to its own SIGN_OUT (navigating to /login) while its sign-out
 * request was still in flight — Firefox aborts that request, so the user stayed
 * signed in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VaultSyncMessage } from "@/lib/vault/sync"

type SyncModule = typeof import("@/lib/vault/sync")

const signOut: VaultSyncMessage = { type: "SIGN_OUT", timestamp: 1, source: "user-nav" }
const unsubscribers: Array<() => void> = []

// A fresh module instance stands in for another tab's document.
async function loadDocument(): Promise<SyncModule> {
    vi.resetModules()
    return import("@/lib/vault/sync")
}

function subscribe(sync: SyncModule) {
    const onMessage = vi.fn()
    unsubscribers.push(sync.subscribeToVaultSync(onMessage))
    return onMessage
}

// BroadcastChannel delivery is asynchronous.
const deliveries = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("vault sync", () => {
    beforeEach(() => {
        expect(typeof BroadcastChannel).toBe("function")
    })

    afterEach(() => {
        unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe())
    })

    it("does not deliver a broadcast back to the document that sent it", async () => {
        const sync = await loadDocument()
        const onMessage = subscribe(sync)

        sync.broadcastVaultMessage(signOut)
        await deliveries()

        expect(onMessage).not.toHaveBeenCalled()
    })

    it("still delivers broadcasts to other tabs", async () => {
        const receiver = await loadDocument()
        const onMessage = subscribe(receiver)
        const sender = await loadDocument()

        sender.broadcastVaultMessage(signOut)
        await deliveries()

        expect(onMessage).toHaveBeenCalledTimes(1)
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining(signOut))
    })

    it("accepts messages from tabs that predate the sender tag", async () => {
        const onMessage = subscribe(await loadDocument())

        const legacyTab = new BroadcastChannel("anon-vault")
        legacyTab.postMessage(signOut)
        legacyTab.close()
        await deliveries()

        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining(signOut))
    })
})
