import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"

export function HeroAuthCta() {
    return (
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto justify-center">
            <Button asChild size="lg" className="rounded-full px-6 font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-lg shadow-primary/10">
                <Link href="/register">
                    Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
            </Button>
            <Button variant="outline" size="lg" asChild className="rounded-full px-6 border-primary/20 bg-background font-medium transition-colors">
                <Link href="/pricing">
                    View Pricing <Sparkles className="ml-2 h-4 w-4 text-muted-foreground" />
                </Link>
            </Button>
        </div>
    )
}

export function CtaAuthButtons() {
    return (
        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
            <Button asChild size="lg" variant="secondary" className="rounded-full px-6 sm:px-8 bg-background text-foreground hover:bg-secondary transition-colors border-none font-medium">
                <Link href="/register">
                    Create Free Account <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6 sm:px-8 text-foreground bg-background/70 hover:bg-primary-foreground/40 font-medium">
                <Link href="/pricing">
                    View Pricing <Sparkles className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        </div>
    )
}
