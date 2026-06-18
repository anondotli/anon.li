"use client"

import { useState } from "react"
import Link from "next/link"
import { Shield, Menu, LogOut, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { ModeToggle } from "@/components/shared/mode-toggle"
import { AdminNav } from "./admin-nav"
import { OPEN_COMMAND_PALETTE_EVENT } from "./command-palette"

export function AdminHeader() {
    const [mobileOpen, setMobileOpen] = useState(false)

    const openPalette = () => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
            <div className="container flex h-16 items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={() => setMobileOpen(true)}
                    >
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Open menu</span>
                    </Button>
                    <Link href="/admin" className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-destructive" />
                        <span className="font-semibold">Admin Panel</span>
                    </Link>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={openPalette}
                        className="hidden gap-2 text-muted-foreground sm:flex"
                    >
                        <Search className="h-4 w-4" />
                        <span>Search…</span>
                        <kbd className="ml-2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
                            ⌘K
                        </kbd>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={openPalette}
                        className="sm:hidden"
                    >
                        <Search className="h-5 w-5" />
                        <span className="sr-only">Search</span>
                    </Button>

                    <ModeToggle />

                    <Link
                        href="/dashboard/alias"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <LogOut className="size-4 text-destructive" />
                        <span className="hidden font-semibold sm:inline">Exit Admin</span>
                    </Link>
                </div>
            </div>

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetContent side="left" className="w-64 p-0">
                    <SheetHeader className="px-6 pt-6 pb-4 border-b">
                        <SheetTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-destructive" />
                            Admin Panel
                        </SheetTitle>
                        <SheetDescription className="sr-only">
                            Admin navigation menu
                        </SheetDescription>
                    </SheetHeader>
                    <div className="px-4 py-4 overflow-y-auto" onClick={() => setMobileOpen(false)}>
                        <AdminNav />
                    </div>
                </SheetContent>
            </Sheet>
        </header>
    )
}
