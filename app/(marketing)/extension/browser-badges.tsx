"use client"

import { Button } from "@/components/ui/button"
import { Chromium, Globe } from "lucide-react"

export function BrowserBadges() {
    return (
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://chromewebstore.google.com/detail/ieepggikhdopllhlbdndnlmoflhaeohp" target="_blank" rel="noopener noreferrer">
                <Button size="xl" className="rounded-full px-10 h-16 text-lg font-medium gap-3">
                    <Chromium className="h-5 w-5" />
                    Add to Chrome
                </Button>
            </a>
            <Button asChild size="xl" variant="outline" className="rounded-full bg-background px-10 h-16 text-lg font-medium gap-3">
                <a href="https://addons.mozilla.org/en-US/firefox/addon/anon-li/" target="_blank" rel="noopener noreferrer">
                    <Globe className="h-5 w-5" />
                    Add to Firefox
                </a>
            </Button>
        </div>
    )
}
