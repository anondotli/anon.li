import { ReactNode } from "react"

interface FeatureCardProps {
    icon: ReactNode
    title: string
    description: string
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
    return (
        <div className="group relative p-5 md:p-8 rounded-xl bg-background border border-border/40 hover:border-primary/15 transition-all duration-300 luxury-shadow-sm hover:luxury-shadow-md hover:-translate-y-0.5">
            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            <div className="relative z-10">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/5 text-primary group-hover:bg-primary/10 transition-colors duration-300">
                    {icon}
                </div>
                <h3 className="text-lg font-serif font-medium mb-2 group-hover:text-primary transition-colors duration-200">{title}</h3>
                <p className="text-muted-foreground leading-relaxed font-light">{description}</p>
            </div>
        </div>
    )
}
