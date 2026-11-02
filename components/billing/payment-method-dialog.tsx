"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { CreditCard, Bitcoin } from "lucide-react"
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
import type { Promotion } from "@/config/promotions"

interface PaymentMethodDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    product: string
    tier: string
    promoCode?: string
    /** Running promotion; its code is entered at Stripe (card) checkout only. */
    promotion?: Promotion | null
    /** Billing interval being purchased. Crypto supports both; defaults to yearly. */
    interval?: "monthly" | "yearly"
}

export function PaymentMethodDialog({
    open,
    onOpenChange,
    product,
    tier,
    promoCode,
    promotion,
    interval = "yearly",
}: PaymentMethodDialogProps) {
    const [isCardPending, startCardTransition] = useTransition()
    const [isCryptoPending, startCryptoTransition] = useTransition()

    const handleCard = () => {
        startCardTransition(async () => {
            try {
                const result = await createCheckoutSession({
                    product: product as "bundle" | "alias" | "drop" | "form",
                    tier: tier as "plus" | "pro",
                    frequency: interval,
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
        startCryptoTransition(async () => {
            try {
                const result = await createCryptoCheckout({
                    product: product as "bundle" | "alias" | "drop" | "form",
                    tier: tier as "plus" | "pro",
                    interval,
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
                        Select how you&apos;d like to pay for your {interval} plan.
                    </DialogDescription>
                </DialogHeader>
                {promotion && (
                    <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                        {promotion.name}: enter{" "}
                        <span className="font-mono font-semibold text-foreground">{promotion.code}</span> on the card
                        checkout page for {promotion.percentOff}% off for {promotion.durationMonths} months. Crypto
                        payments aren&apos;t eligible.
                    </p>
                )}
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
