"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { activateHeldCryptoPayment } from "@/actions/admin"

/**
 * "Activate held crypto payment" for a payment parked in `needs_review`
 * because the user still had a live card subscription.
 */
export function HeldCryptoPaymentAction({ paymentId }: { paymentId: string }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleActivate = async () => {
        setLoading(true)
        try {
            const result = await activateHeldCryptoPayment(paymentId)
            if (result.error) {
                throw new Error(result.error)
            }
            toast.success("Crypto payment activated")
            setOpen(false)
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to activate payment")
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                Activate
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title="Activate Held Crypto Payment"
                description="Only activate after the user's card subscription has been canceled (or set to cancel at period end) in Stripe — otherwise the user is billed twice. The crypto plan starts now, or after any running crypto period."
                confirmLabel="Activate"
                variant="default"
                onConfirm={handleActivate}
                loading={loading}
            />
        </>
    )
}
