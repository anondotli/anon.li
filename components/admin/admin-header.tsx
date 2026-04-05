"use client"

import { useState } from "react"
import Link from "next/link"
import { Shield, Menu } from "lucide-react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { AdminNav } from "./admin-nav"

export function AdminHeader() {
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <header className="sticky top-0 z-50 w-full border-b backdrop-blur-md">
            <div className="container flex h-16 items-center justify-between">
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
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/alias"
                        className="flex text-sm text-muted-foreground hover:text-foreground gap-2"
                    >
                        <LogOut className="size-5 text-destructive"/>
                        <span className="font-semibold">Exit Admin</span>
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
