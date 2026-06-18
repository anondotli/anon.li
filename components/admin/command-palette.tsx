"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import { Search } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { navGroups } from "./nav-config"

/** Window event the header button dispatches to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = "admin:open-command-palette"

export function AdminCommandPalette() {
    const router = useRouter()
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((v) => !v)
            }
        }
        const onOpen = () => setOpen(true)
        document.addEventListener("keydown", onKeyDown)
        window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
        return () => {
            document.removeEventListener("keydown", onKeyDown)
            window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
        }
    }, [])

    const go = useCallback(
        (href: string) => {
            setOpen(false)
            router.push(href)
        },
        [router]
    )

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-xl overflow-hidden p-0 gap-0 [&>button]:hidden">
                <DialogTitle className="sr-only">Admin command palette</DialogTitle>
                <Command
                    loop
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/70"
                >
                    <div className="flex items-center gap-2 border-b px-3">
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Command.Input
                            autoFocus
                            placeholder="Search admin… (pages, sections)"
                            className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                            No results found.
                        </Command.Empty>
                        {navGroups.map((group) => (
                            <Command.Group key={group.title} heading={group.title}>
                                {group.items.map((item) => (
                                    <Command.Item
                                        key={item.href}
                                        value={`${item.title} ${item.href} ${(item.keywords ?? []).join(" ")}`}
                                        onSelect={() => go(item.href)}
                                        className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-muted"
                                    >
                                        <item.icon className="h-4 w-4 text-muted-foreground" />
                                        {item.title}
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        ))}
                    </Command.List>
                </Command>
            </DialogContent>
        </Dialog>
    )
}
