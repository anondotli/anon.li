import { SiteHeader } from "@/components/layout/header"
import { LazyFileDropProvider } from "@/components/drop/lazy-provider"
import { SiteFooter } from "@/components/layout/footer"

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <LazyFileDropProvider>
            {/* overflow-x-clip (not -hidden): hidden creates a scroll container,
                which breaks position:sticky in descendants (docs sidebar/TOC). */}
            <div className="flex flex-col min-h-screen bg-background text-foreground overflow-x-clip">
                <SiteHeader />
                <main id="main-content" className="flex-1 pt-16">
                    {children}
                </main>
                <SiteFooter />
            </div>
        </LazyFileDropProvider>
    )
}
