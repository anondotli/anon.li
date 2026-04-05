import { SiteHeader } from "@/components/layout/header"
import { LazyFileDropProvider } from "@/components/drop/lazy-provider"
import dynamic from "next/dynamic"
import { Suspense } from "react"

const SiteFooter = dynamic(() => import("@/components/layout/footer").then(m => m.SiteFooter), {
    loading: () => null,
})

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <LazyFileDropProvider>
            <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">
                <SiteHeader />
                <main id="main-content" className="flex-1 pt-16">
                    {children}
                </main>
                <Suspense fallback={null}>
                    <SiteFooter />
                </Suspense>
            </div>
        </LazyFileDropProvider>
    )
}
