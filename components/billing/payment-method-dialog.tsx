"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { CreditCard, Bitcoin } from "lucide-react"
import { analytics } from "@/lib/analytics"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { createCheckoutSession } from "@/actions/create-checkout-session"
import { createCryptoCheckout } from "@/actions/create-crypto-checkout"

interface PaymentMethodDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    product: string
    tier: string
    promoCode?: string
}

export function PaymentMethodDialog({
    open,
    onOpenChange,
    product,
    tier,
    promoCode,
}: PaymentMethodDialogProps) {
    const [isCardPending, startCardTransition] = useTransition()
    const [isCryptoPending, startCryptoTransition] = useTransition()

    const handleCard = () => {
        analytics.checkoutStarted(product, tier, "yearly")
        startCardTransition(async () => {
            try {
                const result = await createCheckoutSession({
                    product: product as "bundle" | "alias" | "drop",
                    tier: tier as "plus" | "pro",
                    frequency: "yearly",
                    promoCode,
                })
                if (result?.error) {
                    toast.error(result.error)
                }
            } catch {
                // Redirect handled by createCheckoutSession
            }
        })
    }

    const handleCrypto = () => {
        analytics.checkoutStarted(product, tier, "yearly-crypto")
        startCryptoTransition(async () => {
            try {
                const result = await createCryptoCheckout({
                    product: product as "bundle" | "alias" | "drop",
                    tier: tier as "plus" | "pro",
                })
                if (result?.error) {
                    toast.error(result.error)
                }
            } catch {
                // Redirect handled by createCryptoCheckout
            }
        })
    }

    const isPending = isCardPending || isCryptoPending

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Choose payment method</DialogTitle>
                    <DialogDescription>
                        Select how you&apos;d like to pay for your yearly plan.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 pt-2">
                    <Button
                        variant="outline"
                        className="h-auto p-4 justify-start gap-4"
                        onClick={handleCard}
                        disabled={isPending}
                    >
                        <CreditCard className="h-5 w-5 shrink-0" />
                        <div className="text-left">
                            <p className="font-medium">
                                {isCardPending ? "Loading..." : "Pay with Card"}
                            </p>
                            <p className="text-sm text-muted-foreground font-normal">
                                Credit or debit card via Stripe
                            </p>
                        </div>
                    </Button>
                    <Button
                        variant="outline"
                        className="h-auto p-4 justify-start gap-4"
                        onClick={handleCrypto}
                        disabled={isPending}
                    >
                        <Bitcoin className="h-5 w-5 shrink-0" />
                        <div className="text-left">
                            <p className="font-medium">
                                {isCryptoPending ? "Loading..." : "Pay with Crypto"}
                            </p>
                            <p className="text-sm text-muted-foreground font-normal">
                                Bitcoin, Ethereum, and 100+ cryptocurrencies
                            </p>
                        </div>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
