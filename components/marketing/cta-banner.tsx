interface CtaBannerProps {
    title: React.ReactNode
    description?: React.ReactNode
    /** Button row. */
    children?: React.ReactNode
}

// The dark, full-width call-to-action block that closes most marketing pages.
export function CtaBanner({ title, description, children }: CtaBannerProps) {
    return (
        <section className="bg-background py-12 md:py-20">
            <div className="container mx-auto px-6">
                <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-16 text-center text-primary-foreground shadow-2xl md:px-16 md:py-20">
                    <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-overlay" />

                    <div className="relative z-10 mx-auto max-w-3xl space-y-6">
                        <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl lg:text-5xl">
                            {title}
                        </h2>
                        {description && (
                            <p className="mx-auto max-w-2xl text-lg font-light opacity-90">{description}</p>
                        )}
                        {children}
                    </div>
                </div>
            </div>
        </section>
    )
}
