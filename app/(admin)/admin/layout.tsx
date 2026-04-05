import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { AdminNav } from "@/components/admin/admin-nav"
import { AdminHeader } from "@/components/admin/admin-header"
import { getAdminAccessUser } from "@/lib/data/admin"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth()

    // Return 404 if not logged in - hide admin existence
    if (!session?.user?.id) {
        notFound()
    }

    // Always verify from database for admin pages
    const user = await getAdminAccessUser(session.user.id)

    // Return 404 if not admin - hide admin existence
    if (!user?.isAdmin || user.banned) {
        notFound()
    }

    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        notFound()
    }

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <AdminHeader />
            <div className="container flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
                <aside className="fixed top-16 z-30 -ml-2 hidden h-[calc(100vh-4rem)] w-full shrink-0 overflow-y-auto md:sticky md:block border-r border-border/40">
                    <div className="py-8 pr-6">
                        <AdminNav />
                    </div>
                </aside>
                <main id="main-content" className="flex w-full flex-col overflow-hidden py-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
