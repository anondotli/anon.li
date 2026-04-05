import React from "react";
import { ChevronDown } from "lucide-react";

export function NavDropdown({ trigger, children }: { trigger: string; children: React.ReactNode }) {
    return (
        <div className="relative group flex items-center">
            <button
                type="button"
                className="text-sm font-medium hover:text-primary transition-colors inline-flex items-center gap-1"
            >
                {trigger}
                <ChevronDown className="h-3 w-3 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
            </button>
            <div className="absolute left-0 top-full pt-1.5 hidden group-hover:block group-focus-within:block z-50">
                <div className="rounded-md border bg-popover text-popover-foreground shadow-lg p-2 w-[200px]">
                    {children}
                </div>
            </div>
        </div>
    );
}
