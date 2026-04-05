import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function NotFound() {
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-background p-6 z-50">
            {/* Background elements derived from landing page */}
            <div className="fixed inset-0 z-[-1] pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
                <div className="absolute top-[20%] right-[20%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] opacity-70" />
            </div>

            <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="space-y-4">
                    <span className="block text-9xl font-serif font-medium text-primary tracking-tighter select-none opacity-20" aria-hidden="true">
                        404
                    </span>
                    <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight">
                        Page not found
                    </h1>
                    <p className="text-lg text-muted-foreground font-light max-w-md mx-auto">
                        Sorry, we couldn&apos;t find the page you&apos;re looking for. It might have been removed or moved to a new address.
                    </p>
                </div>

                <div className="flex justify-center">
                    <Button asChild className="rounded-full px-8 h-12 text-base" size="lg">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Home
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
