import { GlowBackground } from "./glow-background"

interface PageHeroProps {
    badge?: React.ReactNode
    /** Headline content. Rendered inside the serif <h1>. */
    title: React.ReactNode
    subtitle?: React.ReactNode
    /** Primary call-to-action row (buttons / install panel). */
    actions?: React.ReactNode
    /** Anything below the actions: trust bar, uploader, etc. */
    children?: React.ReactNode
    background?: "center" | "left" | "right" | "minimal"
}

// Shared hero shell for the marketing product/tool pages. Pages supply their own
// copy and CTAs; the layout, background, and entrance fade live here so they
// aren't copy-pasted into every page.
export function PageHero({ badge, title, subtitle, actions, children, background = "center" }: PageHeroProps) {
    return (
        <section className="relative flex min-h-[80vh] w-full items-center justify-center overflow-hidden py-12 md:py-20 lg:py-24">
            <GlowBackground variant={background} />

            <div className="container relative z-10 mx-auto w-full px-6">
                <div className="flex animate-in flex-col items-center space-y-5 text-center duration-700 fade-in">
                    {badge}

                    <div className="mx-auto w-full max-w-5xl space-y-6">
                        <h1 className="font-serif text-4xl font-medium tracking-tight text-primary sm:text-5xl md:text-6xl lg:text-7xl">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="mx-auto max-w-2xl font-light leading-relaxed text-muted-foreground md:text-lg lg:text-xl">
                                {subtitle}
                            </p>
                        )}
                    </div>

                    {actions && <div className="w-full px-4 pt-6 sm:w-auto sm:px-0">{actions}</div>}
                    {children && <div className="w-full pt-10">{children}</div>}
                </div>
            </div>
        </section>
    )
}
