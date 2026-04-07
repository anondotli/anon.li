import { Suspense } from "react"
import { SiteHeader, SiteHeaderFallback } from "@/components/layout/header"
import { LazyFileDropProvider } from "@/components/drop/lazy-provider"
import { SiteFooter } from "@/components/layout/footer"

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <LazyFileDropProvider>
            <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-hidden">
                <Suspense fallback={<SiteHeaderFallback />}>
                    <SiteHeader />
                </Suspense>
                <main id="main-content" className="flex-1 pt-16">
                    {children}
                </main>
                <SiteFooter />
            </div>
        </LazyFileDropProvider>
    )
}
