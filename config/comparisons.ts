type ComparisonValue = boolean | string

interface ComparisonFeatureItem {
    feature: string
    anonli: ComparisonValue
    competitor: ComparisonValue
    /** URL where this specific claim can be verified */
    source?: string
    /** Display text for the source link */
    sourceLabel?: string
}

interface ComparisonFeatureSection {
    category: string
    items: ComparisonFeatureItem[]
}

interface ComparisonPricingRow {
    tier: string
    anonli: string
    competitor: string
}

interface ComparisonEntry {
    id: string
    slug: string
    competitorName: string
    title: string
    description: string
    /** ISO date when this comparison was last verified */
    lastVerified: string
    /** Primary source URL for this competitor's data */
    sourceUrl: string
    /** Display name of the source (e.g., "Dropbox Help Center") */
    sourceName: string
    comparisonData: {
        features: ComparisonFeatureSection[]
        pricing: ComparisonPricingRow[]
    }
    bottomLine: string
    anonliPros: string[]
    competitorPros: string[]
    whoShouldUseData: {
        anonLi: string[]
        competitor: string[]
    }
}

export const comparisons: ComparisonEntry[] = [
    {
        id: "dropbox",
        slug: "dropbox",
        competitorName: "Dropbox",
        title: "anon.li vs Dropbox",
        description: "Dropbox is built for sync and collaboration. anon.li is designed for encrypted, link-based sharing with less account overhead.",
        lastVerified: "2026-04-05",
        sourceUrl: "https://www.dropbox.com/features",
        sourceName: "Dropbox Features Page",
        comparisonData: {
            features: [
                {
                    category: "Privacy & Security",
                    items: [
                        { feature: "End-to-End Encryption", anonli: true, competitor: false, source: "https://help.dropbox.com/security/encryption-in-transit-at-rest", sourceLabel: "Dropbox Encryption Docs" },
                        { feature: "Zero Knowledge", anonli: true, competitor: false, source: "https://help.dropbox.com/security/encryption-in-transit-at-rest", sourceLabel: "Dropbox Encryption Docs" },
                        { feature: "Access to User Files", anonli: false, competitor: true, source: "https://www.dropbox.com/privacy", sourceLabel: "Dropbox Privacy Policy" },
                        { feature: "Open Source Encryption", anonli: true, competitor: false },
                    ]
                },
                {
                    category: "Sharing Features",
                    items: [
                        { feature: "No Account Required to Send", anonli: true, competitor: false },
                        { feature: "Download Limits", anonli: true, competitor: true },
                        { feature: "Password Protection", anonli: true, competitor: true, source: "https://help.dropbox.com/share/set-link-permissions", sourceLabel: "Dropbox Link Permissions" },
                        { feature: "Auto-Delete/Expiry", anonli: true, competitor: false },
                        { feature: "Link Sharing", anonli: true, competitor: true },
                    ]
                },
                {
                    category: "Pricing",
                    items: [
                        { feature: "Free tier", anonli: "5GB transfers", competitor: "2GB storage", source: "https://www.dropbox.com/plans", sourceLabel: "Dropbox Plans" },
                        { feature: "Paid starting at", anonli: "$2.99/mo", competitor: "$11.99/mo", source: "https://www.dropbox.com/plans", sourceLabel: "Dropbox Plans" },
                        { feature: "No account required", anonli: true, competitor: false },
                    ]
                }
            ],
            pricing: []
        },
        bottomLine: "Choose Dropbox for ongoing sync and collaboration. Choose anon.li when you want client-side encrypted, expiring file sharing.",
        anonliPros: ["True Privacy (E2EE)", "No Account Needed", "Auto-Expiring Links"],
        competitorPros: ["File Sync", "Ecosystem Integration", "Long-term Storage"],
        whoShouldUseData: {
            anonLi: ["Need to share sensitive documents", "Want self-destructing files", "Don't want to create an account"],
            competitor: ["Need file synchronization across devices", "Want long-term cloud backup"]
        }
    },
    {
        id: "proton",
        slug: "proton",
        competitorName: "Proton",
        title: "anon.li vs Proton",
        description: "Compare anon.li and Proton (ProtonMail, ProtonDrive). anon.li focuses on aliases and encrypted sharing without requiring a full provider switch.",
        lastVerified: "2026-04-05",
        sourceUrl: "https://proton.me/pricing",
        sourceName: "Proton Pricing Page",
        comparisonData: {
            features: [
                {
                    category: "Email Privacy",
                    items: [
                        { feature: "Email aliases", anonli: "Unlimited (Pro)", competitor: "Via SimpleLogin add-on", source: "https://proton.me/support/creating-aliases", sourceLabel: "Proton Alias Docs" },
                        { feature: "PGP encryption", anonli: "Free (1 key)", competitor: "Built-in (Proton-to-Proton)" },
                        { feature: "External PGP", anonli: true, competitor: true },
                        { feature: "Anonymous signup", anonli: true, competitor: "Limited (captcha)" },
                        { feature: "Custom domains", anonli: "Plus ($3.99/mo)", competitor: "Paid plans", source: "https://proton.me/pricing", sourceLabel: "Proton Pricing" },
                        { feature: "Keep your existing email", anonli: true, competitor: false },
                    ],
                },
                {
                    category: "File Sharing & Storage",
                    items: [
                        { feature: "End-to-end encryption", anonli: true, competitor: true, source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "Zero-knowledge", anonli: true, competitor: true },
                        { feature: "Share with non-users", anonli: true, competitor: "Limited" },
                        { feature: "Download limits", anonli: true, competitor: "Limited" },
                        { feature: "Password protection", anonli: true, competitor: true },
                        { feature: "File expiry controls", anonli: true, competitor: false },
                        { feature: "No account required to receive", anonli: true, competitor: false },
                    ],
                },
                {
                    category: "Independence & Transparency",
                    items: [
                        { feature: "100% open source", anonli: true, competitor: "Partial", source: "https://github.com/ProtonMail", sourceLabel: "Proton GitHub" },
                        { feature: "Independent (no acquisitions)", anonli: true, competitor: "Acquired SimpleLogin" },
                        { feature: "Single-purpose tools", anonli: true, competitor: false },
                        { feature: "No ecosystem lock-in", anonli: true, competitor: false },
                        { feature: "Simple, transparent pricing", anonli: true, competitor: "Complex tiers" },
                    ],
                },
                {
                    category: "Additional Features",
                    items: [
                        { feature: "Calendar", anonli: false, competitor: true },
                        { feature: "VPN included", anonli: false, competitor: "Paid plans" },
                        { feature: "Password manager", anonli: false, competitor: true },
                    ],
                },
            ],
            pricing: []
        },
        bottomLine: "Proton is a broader ecosystem. anon.li is a better fit if you want focused privacy tools that layer onto your existing inbox.",
        anonliPros: ["100% open source", "No ecosystem lock-in", "Keep your email provider", "Simpler pricing", "Independent"],
        competitorPros: ["Full email service", "All-in-one suite", "Swiss jurisdiction", "Native apps"],
        whoShouldUseData: {
            anonLi: ["Already have an email provider you like", "Want aliases without switching", "Want 100% open source tools you can audit", "Need encrypted file sharing with non-users", "Prefer focused, independent tools"],
            competitor: ["Want to replace entire email provider", "Need calendar integration", "Want VPN included", "Value Swiss jurisdiction"]
        }
    },
    {
        id: "google-drive",
        slug: "google-drive",
        competitorName: "Google Drive",
        title: "anon.li vs Google Drive",
        description: "Google Drive is optimized for collaboration and ecosystem integration. anon.li is optimized for encrypted, expiring transfers.",
        lastVerified: "2026-04-05",
        sourceUrl: "https://workspace.google.com/products/drive/",
        sourceName: "Google Drive Product Page",
        comparisonData: {
            features: [
                {
                    category: "Privacy & Security",
                    items: [
                        { feature: "End-to-End Encryption", anonli: true, competitor: false, source: "https://support.google.com/a/answer/6056693", sourceLabel: "Google Workspace Encryption" },
                        { feature: "Zero Knowledge", anonli: true, competitor: false },
                        { feature: "Content scanning", anonli: false, competitor: true, source: "https://policies.google.com/privacy", sourceLabel: "Google Privacy Policy" },
                        { feature: "Ad-based data collection", anonli: false, competitor: true, source: "https://policies.google.com/privacy", sourceLabel: "Google Privacy Policy" },
                        { feature: "Open source", anonli: true, competitor: false },
                    ]
                },
                {
                    category: "Sharing Features",
                    items: [
                        { feature: "No account required to send", anonli: true, competitor: false },
                        { feature: "Auto-delete / expiry", anonli: true, competitor: false },
                        { feature: "Download limits", anonli: true, competitor: false },
                        { feature: "Password protection", anonli: true, competitor: false },
                        { feature: "Real-time collaboration", anonli: false, competitor: true },
                    ]
                },
                {
                    category: "Pricing",
                    items: [
                        { feature: "Free tier", anonli: "5GB transfers", competitor: "15GB storage", source: "https://one.google.com/about/plans", sourceLabel: "Google One Plans" },
                        { feature: "Paid starting at", anonli: "$2.99/mo", competitor: "$1.99/mo (100GB)", source: "https://one.google.com/about/plans", sourceLabel: "Google One Plans" },
                    ]
                }
            ],
            pricing: []
        },
        bottomLine: "Choose Google Drive for collaborative document workflows. Choose anon.li for private, link-based sharing with client-side encryption.",
        anonliPros: ["Complete Privacy (E2EE)", "No Tracking or Content Scanning", "Auto-Expiring Links", "No Account Needed"],
        competitorPros: ["Deep Google Workspace Integration", "Real-time Collaboration", "Large Free Storage"],
        whoShouldUseData: {
            anonLi: ["Care about file privacy", "Need self-destructing transfers", "Don't want content scanned"],
            competitor: ["Need real-time collaboration", "Rely on Google Workspace tooling", "Want long-term cloud storage"]
        }
    },
    {
        id: "wetransfer",
        slug: "wetransfer",
        competitorName: "WeTransfer",
        title: "anon.li vs WeTransfer",
        description: "WeTransfer is optimized for fast, simple transfers. anon.li aims for the same simplicity with stronger client-side privacy controls.",
        lastVerified: "2026-04-05",
        sourceUrl: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-New-WeTransfer-subscription-plans",
        sourceName: "WeTransfer Subscription Plans",
        comparisonData: {
            features: [
                {
                    category: "Security & Privacy",
                    items: [
                        { feature: "Client-side encryption", anonli: true, competitor: false },
                        { feature: "Zero knowledge", anonli: true, competitor: false },
                        { feature: "Password protection", anonli: true, competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-New-WeTransfer-subscription-plans", sourceLabel: "WeTransfer Plans" },
                        { feature: "Open source", anonli: true, competitor: false },
                    ]
                },
                {
                    category: "Sharing Features",
                    items: [
                        { feature: "No account required to send", anonli: true, competitor: true },
                        { feature: "Max file size", anonli: "Up to 250GB", competitor: "Up to 200GB", source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-New-WeTransfer-subscription-plans", sourceLabel: "WeTransfer Plans" },
                        { feature: "Download limits", anonli: true, competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/26059761836306-How-to-Track-Your-Downloads-with-Access-Control", sourceLabel: "WeTransfer Access Control" },
                        { feature: "File expiry controls", anonli: true, competitor: "Paid plans" },
                        { feature: "File requests", anonli: false, competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/19674802507410-Request-files", sourceLabel: "WeTransfer File Requests" },
                        { feature: "Download tracking", anonli: "Aggregate count", competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/26059761836306-How-to-Track-Your-Downloads-with-Access-Control", sourceLabel: "WeTransfer Access Control" },
                    ]
                },
                {
                    category: "Pricing",
                    items: [
                        { feature: "Free tier", anonli: "5GB transfers", competitor: "2GB per transfer", source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-New-WeTransfer-subscription-plans", sourceLabel: "WeTransfer Plans" },
                        { feature: "Paid starting at", anonli: "$2.99/mo", competitor: "$12/mo" },
                        { feature: "Custom branding", anonli: false, competitor: "Paid plans" },
                    ]
                }
            ],
            pricing: []
        },
        bottomLine: "WeTransfer is strong on convenience, brand familiarity, and creative tooling. anon.li is the better fit when privacy and end-to-end encryption matter most.",
        anonliPros: ["End-to-End Encryption", "Zero Knowledge", "Open Source", "Lower Price"],
        competitorPros: ["Brand Recognition", "File Requests", "Custom Branding", "Download Tracking"],
        whoShouldUseData: {
            anonLi: ["Need encrypted file sharing", "Want the service unable to read your files", "Prefer open source tools"],
            competitor: ["Need file request links", "Want branded transfer pages", "Sending non-sensitive creative assets"]
        }
    },
    {
        id: "simplelogin",
        slug: "simplelogin",
        competitorName: "SimpleLogin",
        title: "anon.li vs SimpleLogin",
        description: "SimpleLogin is an established aliasing service owned by Proton. anon.li offers an independent alternative with encrypted file sharing in the same product suite.",
        lastVerified: "2026-04-05",
        sourceUrl: "https://simplelogin.io/pricing/",
        sourceName: "SimpleLogin Pricing Page",
        comparisonData: {
            features: [
                {
                    category: "Alias Features",
                    items: [
                        { feature: "Free aliases", anonli: "10", competitor: "10", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Unlimited aliases (paid)", anonli: "Unlimited (Pro)", competitor: true, source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Custom domains", anonli: true, competitor: true },
                        { feature: "Anonymous replies", anonli: true, competitor: true },
                        { feature: "PGP encryption", anonli: true, competitor: true },
                        { feature: "Multiple recipients per alias", anonli: true, competitor: true },
                        { feature: "Catch-all on custom domains", anonli: true, competitor: true },
                    ]
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file sharing", anonli: true, competitor: false },
                        { feature: "End-to-end encryption", anonli: true, competitor: false },
                        { feature: "No account to receive files", anonli: true, competitor: false },
                        { feature: "Download limits", anonli: true, competitor: false },
                    ]
                },
                {
                    category: "Independence & Platform",
                    items: [
                        { feature: "Independent project", anonli: true, competitor: false, source: "https://proton.me/blog/proton-and-simplelogin-join-forces", sourceLabel: "Proton Acquisition Announcement" },
                        { feature: "Open source", anonli: true, competitor: true, source: "https://github.com/simple-login", sourceLabel: "SimpleLogin GitHub" },
                        { feature: "Browser extension", anonli: "Firefox + Chrome", competitor: true, source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Mobile apps", anonli: false, competitor: true, source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                    ]
                },
                {
                    category: "Pricing",
                    items: [
                        { feature: "Free tier", anonli: "10 aliases + 5GB drops", competitor: "10 aliases" },
                        { feature: "Paid starting at", anonli: "$2.49/mo (alias only)", competitor: "$4/mo", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                    ]
                }
            ],
            pricing: []
        },
        bottomLine: "SimpleLogin is a mature, focused aliasing service with strong Proton integration. anon.li is the better choice if you want aliasing plus encrypted file sharing in one independent product.",
        anonliPros: ["Encrypted File Sharing Included", "Independent (not acquired)", "Lower Starting Price", "Combined Alias + Drop Product"],
        competitorPros: ["Established & Mature", "Proton Integration", "Mobile Apps", "Larger Free Extension Ecosystem"],
        whoShouldUseData: {
            anonLi: ["Want aliases AND encrypted file sharing", "Prefer independent tools", "Want a combined privacy suite"],
            competitor: ["Only need email aliases", "Heavy Proton user", "Need mobile apps today"]
        }
    }
];

export function getComparison(slug: string) {
    return comparisons.find((c) => c.slug === slug);
}
