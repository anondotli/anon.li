"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import { DashboardNav } from "@/components/dashboard/nav"
import { Icons } from "@/components/shared/icons"
import Link from "next/link"

export function DashboardMobileNav() {
    const [open, setOpen] = useState(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="pr-0">
                <SheetHeader className="sr-only">
                    <SheetTitle>Dashboard navigation</SheetTitle>
                    <SheetDescription>
                        Navigate between dashboard sections.
                    </SheetDescription>
                </SheetHeader>
                <div className="px-7">
                    <Link
                        href="/"
                        className="flex items-center"
                        onClick={() => setOpen(false)}
                    >
                        <Icons.logo className="mr-2 h-4 w-4" />
                        <span className="font-bold">anon.li</span>
                    </Link>
                </div>
                <div className="px-3 py-6 h-full">
                    <DashboardNav />
                </div>
            </SheetContent>
        </Sheet>
    )
}
