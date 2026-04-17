"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const subscribe = () => () => {}

export function ModeToggle() {
    const { theme, setTheme } = useTheme()
    const mounted = React.useSyncExternalStore(subscribe, () => true, () => false)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <div className="relative h-4 w-4">
                        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </div>
                    <span className="text-sm">
                        {mounted ? (theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System") : "Theme"}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>
                    Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                    Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                    System
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
