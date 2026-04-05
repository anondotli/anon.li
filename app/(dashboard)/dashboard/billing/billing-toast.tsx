"use client"

import { useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"

export function BillingToast() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const toastShown = useRef(false)

    useEffect(() => {
        if (toastShown.current) return

        if (searchParams.get("success") === "true") {
            toast.success("Subscription updated!", {
                description: "Thank you for your purchase. Your plan has been upgraded."
            })
            toastShown.current = true
            router.replace("/dashboard/billing")
        }

        if (searchParams.get("crypto-success") === "true") {
            toast.success("Plan activated via crypto payment!", {
                description: "Your subscription is now active. Thank you!"
            })
            toastShown.current = true
            router.replace("/dashboard/billing")
        }

        if (searchParams.get("canceled") === "true") {
            toast.error("Checkout canceled", {
                description: "Your payment was canceled. No charges were made."
            })
            toastShown.current = true
            router.replace("/dashboard/billing")
        }
    }, [searchParams, router])

    return null
}
