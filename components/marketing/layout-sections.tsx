import { Mail, FileUp } from "lucide-react"
import { CtaAuthButtons } from "./auth-aware-cta"

export function HowItWorksSection() {
    return (
        <section id="how-it-works" className="py-12 md:py-20 bg-secondary/20 backdrop-blur-sm border-t border-border/40">
            <div className="container mx-auto px-6">
                <div className="text-center mb-8 md:mb-14 space-y-4">
                    <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Simple by Design</h2>
                    <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
                        Privacy shouldn&apos;t be complicated. Get started in seconds.
                    </p>
                </div>

                <div className="grid gap-8 lg:gap-12 lg:grid-cols-2">
                    {/* Mail Steps */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                                <Mail className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-serif font-medium">Email Aliases</h3>
                        </div>
                        <StepItem number="1" title="Create an Alias" description="Generate random or custom aliases like shop@anon.li in one click." />
                        <StepItem number="2" title="Use Anywhere" description="Sign up for newsletters, apps, or services without exposing your real email." />
                        <StepItem number="3" title="Stay Private" description="All emails forward to your inbox. Reply via your alias while keeping your real address hidden." />
                    </div>

                    {/* File Steps */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                                <FileUp className="h-5 w-5" />
                            </div>
                            <h3 className="text-xl font-serif font-medium">File Sharing</h3>
                        </div>
                        <StepItem number="1" title="Drop Your File" description="Drag and drop any file. Encryption starts instantly in your browser." />
                        <StepItem number="2" title="Get a Link" description="Receive a unique link with the encryption key. That's it." />
                        <StepItem number="3" title="Share Securely" description="Recipients decrypt in their browser. We never see the contents." />
                    </div>
                </div>
            </div>
        </section>
    )
}

function StepItem({ number, title, description }: { number: string; title: string; description: string }) {
    return (
        <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif font-medium text-sm">
                {number}
            </div>
            <div>
                <span className="text-base font-medium mb-1 block">{title}</span>
                <p className="text-muted-foreground font-light">{description}</p>
            </div>
        </div>
    )
}

export function CtaSection() {
    return (
        <section className="py-12 md:py-20 bg-background">
            <div className="container mx-auto px-6">
                <div className="relative rounded-2xl overflow-hidden bg-primary text-primary-foreground px-6 py-16 md:px-16 md:py-20 text-center shadow-2xl">
                    <div className="absolute inset-0 opacity-20 bg-[url('/noise.svg')] mix-blend-overlay"></div>

                    <div className="relative z-10 space-y-6 max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-medium tracking-tight leading-tight">
                            Ready to take back your privacy?
                        </h2>
                        <p className="text-lg opacity-90 font-light max-w-2xl mx-auto">
                            Protect your identity online. Free to start, built for people who value privacy.
                        </p>
                        <CtaAuthButtons />
                    </div>
                </div>
            </div>
        </section>
    )
}
