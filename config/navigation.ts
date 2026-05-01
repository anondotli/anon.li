import { ClipboardList, Package, Mail, FileUp } from "lucide-react";
import { type ProductContext } from "@/config/site";

/**
 * Product options for navigation menus (desktop and mobile)
 * Centralized to avoid duplication between nav components
 */
export const productOptions = [
    { id: "default", name: "anon.li", tagline: "Complete privacy suite", icon: Package, href: "/" },
    { id: "alias", name: "Alias", tagline: "Anonymous email aliases", icon: Mail, href: "/alias" },
    { id: "drop", name: "Drop", tagline: "E2E encrypted sharing", icon: FileUp, href: "/drop" },
    { id: "form", name: "Form", tagline: "Encrypted form submissions", icon: ClipboardList, href: "/form" },
];

/**
 * Landing pages for each product context
 * Used for navigation and redirects
 */
export const landingPages: Record<ProductContext, string> = {
    default: "/",
    alias: "/alias",
    drop: "/drop",
    form: "/form",
};
