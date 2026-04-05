import { ReactNode } from "react"

interface StepCardProps {
    number: string
    icon: ReactNode
    title: string
    description: string
}

export function StepCard({ number, icon, title, description }: StepCardProps) {
    return (
        <div className="relative flex flex-col items-center text-center z-10">
            <div className="w-12 h-12 rounded-xl bg-background border border-border/60 shadow-md flex items-center justify-center text-lg font-medium mb-5 relative group transition-transform duration-200 hover:-translate-y-0.5">
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-serif">
                    {number}
                </span>
                <div className="text-muted-foreground group-hover:text-primary transition-colors">
                    {icon}
                </div>
            </div>
            <h3 className="text-lg font-serif font-medium mb-2">{title}</h3>
            <p className="text-muted-foreground max-w-xs mx-auto font-light leading-relaxed">
                {description}
            </p>
        </div>
    )
}
