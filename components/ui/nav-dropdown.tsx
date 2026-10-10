"use client";

import React, { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hover/focus-driven dropdown. Visibility stays CSS-based (works before
 * hydration); state only tracks it for `aria-expanded` and lets a link click
 * or Escape dismiss the panel, which `:focus-within`/`:hover` would otherwise
 * keep open after a client-side navigation.
 */
export function NavDropdown({ trigger, children }: { trigger: string; children: React.ReactNode }) {
    const panelId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [hovered, setHovered] = useState(false);
    const [focusWithin, setFocusWithin] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const expanded = (hovered || focusWithin) && !dismissed;

    const handlePanelClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!(event.target as HTMLElement).closest("a")) return;
        // Drop focus so :focus-within releases the panel, then keep it hidden
        // until the pointer leaves (hover would otherwise re-show it).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        setDismissed(true);
    };

    return (
        <div
            className="relative group flex items-center"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
                setHovered(false);
                setDismissed(false);
            }}
            onFocus={() => setFocusWithin(true)}
            onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setFocusWithin(false);
                setDismissed(false);
            }}
            onKeyDown={(event) => {
                if (event.key === "Escape" && expanded) {
                    setDismissed(true);
                    triggerRef.current?.focus();
                }
            }}
        >
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setDismissed(false)}
                className="text-sm font-medium hover:text-primary transition-colors inline-flex items-center gap-1"
            >
                {trigger}
                <ChevronDown
                    className={cn(
                        "h-3 w-3 transition-transform duration-200",
                        !dismissed && "group-hover:rotate-180 group-focus-within:rotate-180",
                    )}
                />
            </button>
            <div
                id={panelId}
                onClick={handlePanelClick}
                className={cn(
                    "absolute left-0 top-full pt-1.5 hidden z-50",
                    !dismissed && "group-hover:block group-focus-within:block",
                )}
            >
                <div className="rounded-md border bg-popover text-popover-foreground shadow-lg p-2 w-[200px]">
                    {children}
                </div>
            </div>
        </div>
    );
}
