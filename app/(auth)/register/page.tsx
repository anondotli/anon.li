import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getReferralRewardPreview } from "@/lib/services/referral";
import { RegisterPageContent } from "./register-content"

export const metadata = {
    title: "Register",
    description: "Create an account",
}

interface RegisterPageProps {
    searchParams: Promise<{ ref?: string }>
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
    const session = await auth();
    if (session) redirect("/dashboard/alias");

    // Surface the referral reward before the account exists. The first-touch
    // `anonli_ref` cookie covers visitors who browsed elsewhere first; the `?ref`
    // param covers a direct landing on /register, where middleware has only just
    // set the cookie on the response (so it isn't in the request yet).
    const { ref } = await searchParams
    const cookieStore = await cookies()
    const preview = await getReferralRewardPreview(ref ?? cookieStore.get("anonli_ref")?.value)

    return <RegisterPageContent referralRewardDays={preview?.rewardDays ?? null} />
}
