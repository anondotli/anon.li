import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { CryptoSuccessContent } from "./crypto-success-content"

interface PageProps {
    searchParams: Promise<{ orderId?: string }>
}

export default async function CryptoSuccessPage({ searchParams }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const { orderId } = await searchParams
    if (!orderId) redirect("/dashboard/billing")

    return <CryptoSuccessContent orderId={orderId} />
}
