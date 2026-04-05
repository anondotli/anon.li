import { auth } from "@/auth"
import { SiteNav } from "@/components/layout/nav"

export async function SiteHeader() {
    const session = await auth()
    return <SiteNav isLoggedIn={!!session?.user} />
}