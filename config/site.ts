export type ProductContext = "alias" | "drop" | "default";

interface SiteConfig {
  name: string;
  shortName: string;
  productName: string | null; // "Alias" or "Drop" - null for default
  description: string;
  url: string;
  pricingLink: string;
  ctaLink: string;
  metadata?: {
    title?: string | { default: string; template: string };
    description?: string;
    keywords?: string[];
    authors?: { name: string }[];
    creator?: string;
    publisher?: string;
    twitter?: {
      card?: string;
      creator?: string;
    }
  };
}

export const siteConfig: Record<ProductContext | "pricing" | "about" | "security" | "faq", SiteConfig> = {
  default: {
    name: "anon.li",
    shortName: "anon.li",
    productName: null,
    description: "Protect your identity with anonymous email aliases and end-to-end encrypted file sharing. Forward emails to your real inbox without exposing your personal address. Zero-knowledge, open source security, and privacy-focused.",
    url: "https://anon.li",
    pricingLink: "/pricing",
    ctaLink: "/register",
    metadata: {
      title: {
        default: "anon.li - Privacy-First Email Aliases & Encrypted File Sharing",
        template: "%s | anon.li",
      },
      keywords: [
        "email forwarding",
        "anonymous email",
        "email alias",
        "privacy",
        "security",
        "open source security",
        "open source privacy tools",
        "open source",
        "encrypted file sharing",
        "secure file transfer",
        "zero knowledge",
        "E2E encryption",
        "WeTransfer alternative",
        "SimpleLogin alternative",
      ],
      authors: [{ name: "Anon.li Team" }],
      creator: "Anon.li",
      publisher: "Anon.li",
      twitter: {
        card: "summary_large_image",
        creator: "@anonli",
      },
    }
  },
  alias: {
    name: "anon.li Alias",
    shortName: "Alias",
    productName: "Alias",
    description: "Privacy-First Email Aliases & Forwarding",
    url: "https://anon.li/alias",
    pricingLink: "/pricing?alias",
    ctaLink: "/register",
    metadata: {
      title: "Privacy-First Email Aliases",
      keywords: ["email alias", "anonymous email", "forwarding", "privacy"],
    }
  },
  drop: {
    name: "anon.li Drop",
    shortName: "Drop",
    productName: "Drop",
    description: "End-to-End Encrypted File Sharing",
    url: "https://anon.li/drop",
    pricingLink: "/pricing?drop",
    ctaLink: "/register",
    metadata: {
      title: "End-to-end Encrypted File Sharing",
      keywords: ["file sharing", "encrypted transfer", "secure upload", "privacy", "drop"],
    }
  },
  pricing: {
    name: "Pricing",
    shortName: "Pricing",
    productName: null,
    description: "Simple, transparent pricing. Free for everyone, upgrades for power users.",
    url: "https://anon.li/pricing",
    pricingLink: "/pricing",
    ctaLink: "/register",
    metadata: {
      title: "Pricing",
      description: "Simple, transparent pricing. Free plan available forever. Upgrade for custom domains and unlimited bandwidth.",
    }
  },
  about: {
    name: "About",
    shortName: "About",
    productName: null,
    description: "About anon.li - Our mission to reclaim privacy.",
    url: "https://anon.li/about",
    pricingLink: "/pricing",
    ctaLink: "/register",
    metadata: {
      title: "About Us",
      description: "We are building the privacy layer for the internet. Learn about our mission to protect your digital identity.",
    }
  },
  security: {
    name: "Security",
    shortName: "Security",
    productName: null,
    description: "Security Architecture - How we protect your data.",
    url: "https://anon.li/security",
    pricingLink: "/pricing",
    ctaLink: "/register",
    metadata: {
      title: "Security Architecture",
      description: "Technical deep dive into our zero-knowledge architecture, encryption standards, and auditing practices.",
    }
  },
  faq: {
    name: "FAQ",
    shortName: "FAQ",
    productName: null,
    description: "Frequently Asked Questions",
    url: "https://anon.li/faq",
    pricingLink: "/pricing",
    ctaLink: "/register",
    metadata: {
      title: "FAQ",
      description: "Answers to common questions about anon.li email aliases and file sharing.",
    }
  }
};

/**
 * Determine product context from pathname
 */
export function getProductContext(pathname: string): ProductContext {
  if (pathname.startsWith("/alias") || pathname.startsWith("/dashboard/alias")) {
    return "alias";
  }
  if (pathname.startsWith("/drop") || pathname.startsWith("/dashboard/drop") || pathname.startsWith("/d/")) {
    return "drop";
  }
  return "default";
}