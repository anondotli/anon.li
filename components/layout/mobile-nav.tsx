"use client";

import Link from "next/link";
import { type ProductContext } from "@/config/site";
import { productOptions } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Users, Shield, HelpCircle, Menu, Terminal, Puzzle, Code2 } from "lucide-react";
import { Icons } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";

interface SiteMobileNavProps {
    product: ProductContext;
    config: { pricingLink: string };
    isLoggedIn?: boolean;
}

export function SiteMobileNav({ product, config, isLoggedIn }: SiteMobileNavProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden text-foreground/70 hover:text-foreground">
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">Toggle menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[350px] flex flex-col">
                <SheetHeader>
                    <SheetTitle className="text-left flex items-center gap-2">
                        <Icons.logo className="h-5 w-5 text-primary" />
                        <span>anon.li</span>
                    </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-6 mt-6 flex-1 min-h-0 overflow-y-auto">
                    {/* Product Switcher */}
                    <div className="space-y-3">
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider block">Products</span>
                        <div className="grid grid-cols-3 gap-2">
                            {productOptions.map((option) => {
                                const Icon = option.icon;
                                const isActive = product === option.id;
                                return (
                                    <Link
                                        key={option.id}
                                        href={option.href}
                                        onClick={() => setIsOpen(false)}
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-colors",
                                            isActive
                                                ? "bg-primary/10 text-primary"
                                                : "hover:bg-accent"
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                        <span className="text-xs font-medium">
                                            {option.id === "default" ? "Bundle" : option.name}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    {/* Company Links */}
                    <div className="space-y-3">
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider block">Company</span>
                        <div className="flex flex-col gap-2 pl-2 border-l-2 border-primary/10">
                            <Link
                                href="/about"
                                className="flex items-center gap-3 py-2 text-sm hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Users className="h-4 w-4 text-muted-foreground" />
                                About
                            </Link>
                            <Link
                                href="/security"
                                className="flex items-center gap-3 py-2 text-sm hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                Security
                            </Link>
                            <Link
                                href="/faq"
                                className="flex items-center gap-3 py-2 text-sm hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                FAQ
                            </Link>
                        </div>
                    </div>

                    {/* Resources */}
                    <div className="space-y-3">
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider block">Resources</span>
                        <div className="flex flex-col gap-1">
                            <Link
                                href="/blog"
                                className="block py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                Blog
                            </Link>
                            <Link
                                href="/docs"
                                className="block py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                Docs
                            </Link>
                            <Link
                                href="/compare"
                                className="block py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                Compare
                            </Link>
                            {product === "drop" && (
                                <Link
                                    href="/drop/upload"
                                    className="block py-2 text-sm font-medium hover:text-primary transition-colors"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Upload
                                </Link>
                            )}
                            <Link
                                href={config.pricingLink}
                                className="block py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                Pricing
                            </Link>
                        </div>
                    </div>

                    {/* Tools */}
                    <div className="space-y-3">
                        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider block">Tools</span>
                        <div className="flex flex-col gap-1">
                            <Link
                                href="/docs/api"
                                className="flex items-center gap-2 py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Code2 className="h-4 w-4 text-muted-foreground" />
                                API
                            </Link>
                            <Link
                                href="/cli"
                                className="flex items-center gap-2 py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Terminal className="h-4 w-4 text-muted-foreground" />
                                CLI
                            </Link>
                            <Link
                                href="/extension"
                                className="flex items-center gap-2 py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Puzzle className="h-4 w-4 text-muted-foreground" />
                                Extension
                            </Link>
                            <Link
                                href="/mcp"
                                className="flex items-center gap-2 py-2 text-sm font-medium hover:text-primary transition-colors"
                                onClick={() => setIsOpen(false)}
                            >
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                MCP
                            </Link>
                        </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t">
                        {isLoggedIn ? (
                            <Link
                                href="/dashboard/alias"
                                onClick={() => setIsOpen(false)}
                            >
                                <Button className="w-full rounded-full">Dashboard</Button>
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href="/register"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <Button className="w-full rounded-full">Get Started</Button>
                                </Link>
                                <Link
                                    href="/login"
                                    className="block w-full text-center py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Already have an account? Sign in
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
