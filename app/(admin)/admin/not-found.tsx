import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function AdminNotFound() {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-7xl font-serif font-medium text-primary/20 tracking-tighter select-none mb-4" aria-hidden="true">
                404
            </span>
            <h1 className="text-2xl font-serif font-medium tracking-tight mb-2">
                Page not found
            </h1>
            <p className="text-muted-foreground font-light mb-8 max-w-sm">
                This admin page doesn&apos;t exist.
            </p>
            <Button asChild variant="outline" className="rounded-full">
                <Link href="/admin">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Admin
                </Link>
            </Button>
        </div>
    )
}
