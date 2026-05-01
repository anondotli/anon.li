"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Icons } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { BookOpen, Code2, FileText, Shield, HelpCircle, Users, Check, Mail, FileUp, ClipboardList, ChevronDown, Terminal, Puzzle } from "lucide-react";
import { siteConfig, getProductContext } from "@/config/site";
import { productOptions, landingPages } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { NavDropdown } from "@/components/ui/nav-dropdown";
import dynamic from "next/dynamic";

const SiteMobileNav = dynamic(() => import("./mobile-nav").then(m => m.SiteMobileNav), {
    ssr: false,
    loading: () => null,
});

export function SiteNav({ isLoggedIn }: { isLoggedIn?: boolean }) {
    const pathname = usePathname();
    const router = useRouter();
    const product = getProductContext(pathname);
    const config = siteConfig[product];

    const [menuValue, setMenuValue] = useState<string>("");
    const [shouldOpenAfterNav, setShouldOpenAfterNav] = useState(false);

    const isOnLandingPage = pathname === landingPages[product];

    useEffect(() => {
        if (shouldOpenAfterNav && isOnLandingPage) {
            // Using requestAnimationFrame for better timing than setTimeout
            requestAnimationFrame(() => {
                setMenuValue("products");
                setShouldOpenAfterNav(false);
            });
        }
    }, [pathname, shouldOpenAfterNav, isOnLandingPage]);

    const handleLogoClick = (e: React.MouseEvent) => {
        if (!isOnLandingPage) {
            e.preventDefault();
            setShouldOpenAfterNav(true);
            router.push(landingPages[product]);
        }
        // If on landing page, let the default NavigationMenuTrigger behavior handle it
    };

    return (
        <header className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-6 h-16 flex items-center justify-between">
                {/* Logo with Product Switcher */}
                <div className="flex items-center">
                <NavigationMenu value={menuValue} onValueChange={setMenuValue} className="flex-none">
                    <NavigationMenuList>
                        <NavigationMenuItem value="products">
                            <NavigationMenuTrigger
                                onClick={handleLogoClick}
                                showChevron={false}
                                className="h-10 cursor-pointer items-center gap-2 bg-transparent px-0 py-0 leading-none hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent"
                            >
                                <div className="flex h-10 items-center gap-2">
                                    <div className="rounded-lg bg-primary/10 p-1.5">
                                        <Icons.logo className="h-5 w-5 text-primary" />
                                    </div>
                                    <span className="text-lg font-bold tracking-tight leading-none">
                                        anon.li{config.productName && <span> {config.productName}</span>}
                                    </span>
                                    <ChevronDown
                                        className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                                        aria-hidden="true"
                                    />
                                </div>
                            </NavigationMenuTrigger>
                            <NavigationMenuContent>
                                <ul className="w-[280px] p-2">
                                    {productOptions.map((option) => {
                                        const Icon = option.icon;
                                        const isActive = product === option.id;
                                        return (
                                            <li key={option.id}>
                                                <NavigationMenuLink asChild>
                                                    <Link
                                                        href={option.href}
                                                        className={cn(
                                                            "flex items-center gap-3 select-none rounded-lg p-3 leading-none no-underline outline-none transition-colors",
                                                            isActive
                                                                ? "bg-primary/10 text-primary"
                                                                : "hover:bg-accent hover:text-accent-foreground"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "p-2 rounded-lg",
                                                            isActive ? "bg-primary/20" : "bg-muted"
                                                        )}>
                                                            <Icon className="h-4 w-4" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="text-sm font-medium">
                                                                {option.id === "default" ? "anon.li" : `anon.li ${option.name}`}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">{option.tagline}</p>
                                                        </div>
                                                        {isActive && <Check className="h-4 w-4 text-primary" />}
                                                    </Link>
                                                </NavigationMenuLink>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </NavigationMenuContent>
                        </NavigationMenuItem>
                    </NavigationMenuList>
                </NavigationMenu>
                </div>

                <nav className="hidden md:flex items-center gap-6">
                    <NavDropdown trigger="Products">
                        <Link
                            href="/alias"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Mail className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Alias</div>
                                <p className="text-xs text-muted-foreground">Email forwarding</p>
                            </div>
                        </Link>
                        <Link
                            href="/drop"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <FileUp className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Drop</div>
                                <p className="text-xs text-muted-foreground">E2EE file sharing</p>
                            </div>
                        </Link>
                        <Link
                            href="/form"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <ClipboardList className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Form</div>
                                <p className="text-xs text-muted-foreground">E2EE forms</p>
                            </div>
                        </Link>
                    </NavDropdown>
                    <NavDropdown trigger="Company">
                        <Link
                            href="/about"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Users className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">About</div>
                                <p className="text-xs text-muted-foreground">Our mission</p>
                            </div>
                        </Link>
                        <Link
                            href="/security"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Shield className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Security</div>
                                <p className="text-xs text-muted-foreground">How we protect you</p>
                            </div>
                        </Link>
                        <Link
                            href="/faq"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <HelpCircle className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">FAQ</div>
                                <p className="text-xs text-muted-foreground">Common questions</p>
                            </div>
                        </Link>
                    </NavDropdown>
                    <NavDropdown trigger="Tools">
                        <Link
                            href="/docs/api"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Code2 className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">API</div>
                                <p className="text-xs text-muted-foreground">Programmatic access</p>
                            </div>
                        </Link>
                        <Link
                            href="/cli"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Terminal className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">CLI</div>
                                <p className="text-xs text-muted-foreground">Terminal workflows</p>
                            </div>
                        </Link>
                        <Link
                            href="/extension"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Puzzle className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Extension</div>
                                <p className="text-xs text-muted-foreground">Browser workflows</p>
                            </div>
                        </Link>
                        <Link
                            href="/mcp"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Shield className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">MCP</div>
                                <p className="text-xs text-muted-foreground">AI tool access</p>
                            </div>
                        </Link>
                    </NavDropdown>
                    <NavDropdown trigger="Resources">
                        <Link
                            href="/docs"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <BookOpen className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Docs</div>
                                <p className="text-xs text-muted-foreground">Guides and API reference</p>
                            </div>
                        </Link>
                        <Link
                            href="/blog"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <FileText className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Blog</div>
                                <p className="text-xs text-muted-foreground">Product updates</p>
                            </div>
                        </Link>
                        <Link
                            href="/compare"
                            className="flex items-center gap-3 select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        >
                            <Check className="h-4 w-4" />
                            <div>
                                <div className="text-sm font-medium">Compare</div>
                                <p className="text-xs text-muted-foreground">Alternative guides</p>
                            </div>
                        </Link>
                    </NavDropdown>
                    {product === "drop" && (
                        <Link className="text-sm font-medium hover:text-primary transition-colors" href="/drop/upload">
                            Upload
                        </Link>
                    )}
                    <Link className="text-sm font-medium hover:text-primary transition-colors" href={config.pricingLink}>
                        Pricing
                    </Link>
                </nav>
                <div className="flex items-center gap-4">
                    {isLoggedIn ? (
                        <Button asChild size="sm" className="hidden md:inline-flex rounded-full px-6 shadow-none">
                            <Link href="/dashboard/alias">Dashboard</Link>
                        </Button>
                    ) : (
                        <>
                            <Link className="text-sm font-medium hover:text-primary transition-colors hidden md:block" href="/login">
                                Login
                            </Link>
                            <Button asChild size="sm" className="hidden md:inline-flex rounded-full px-6 shadow-none">
                                <Link href="/register">Get Started</Link>
                            </Button>
                        </>
                    )}

                    <SiteMobileNav product={product} config={config} isLoggedIn={isLoggedIn} />
                </div>
            </div>
        </header>
    );
}
