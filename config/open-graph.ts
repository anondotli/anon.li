import type { Metadata } from "next";

import { siteConfig } from "@/config/site";

const DEFAULT_OG_IMAGE = {
    url: "/og-image.png",
    width: 1200,
    height: 630,
    alt: `${siteConfig.default.name} - Privacy-First Email Aliasing, File Sharing & Encrypted Forms`,
};

interface BuildOpenGraphInput {
    title: string;
    description: string;
    /** Absolute page URL; og:url must be absolute per the OG protocol. */
    url: string;
    type?: "website" | "article";
    images?: NonNullable<Metadata["openGraph"]>["images"];
}

/**
 * Build a complete Open Graph block. Next.js shallow-merges metadata, so a
 * page-level `openGraph` replaces the root layout's block entirely — a partial
 * block drops inherited og:image/og:type/og:url. Every page that overrides
 * openGraph should go through this helper so the four required tags
 * (og:title, og:type, og:image, og:url) are always present and absolute.
 */
export function buildOpenGraph({
    title,
    description,
    url,
    type = "website",
    images = [DEFAULT_OG_IMAGE],
}: BuildOpenGraphInput): NonNullable<Metadata["openGraph"]> {
    return {
        title,
        description,
        url,
        type,
        siteName: siteConfig.default.name,
        locale: "en_US",
        images,
    };
}
