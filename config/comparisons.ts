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

export interface ComparisonEntry {
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

const LAST_VERIFIED = "2026-04-17"

const anonPricingSource = {
    source: "https://anon.li/pricing",
    sourceLabel: "anon.li Pricing",
}

const anonSecuritySource = {
    source: "https://anon.li/security",
    sourceLabel: "anon.li Security",
}

const anonSourceCode = {
    source: "https://codeberg.org/anonli/anon.li",
    sourceLabel: "anon.li Source Code",
}

export const comparisons: ComparisonEntry[] = [
    {
        id: "dropbox",
        slug: "dropbox",
        competitorName: "Dropbox",
        title: "anon.li vs Dropbox",
        description: "Dropbox is built for sync, backup, and team collaboration. anon.li is designed for encrypted, expiring file transfers and email aliases with less account overhead.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://help.dropbox.com/share/set-link-permissions",
        sourceName: "Dropbox Shared Link Permissions",
        comparisonData: {
            features: [
                {
                    category: "Best Fit",
                    items: [
                        { feature: "Primary use case", anonli: "Private aliases + encrypted transfers", competitor: "Cloud storage, sync, and collaboration" },
                        { feature: "Recipient account required", anonli: "No for downloads", competitor: "No for public shared links", source: "https://help.dropbox.com/share/set-link-permissions", sourceLabel: "Dropbox Shared Link Permissions" },
                        { feature: "Long-term file storage", anonli: "Transfer-focused", competitor: "Core product" },
                        { feature: "Real-time document collaboration", anonli: false, competitor: true },
                    ],
                },
                {
                    category: "Security & Link Controls",
                    items: [
                        { feature: "Client-side encrypted transfers by default", anonli: true, competitor: "Not default for standard Dropbox files", source: "https://help.dropbox.com/security/advanced-encryption", sourceLabel: "Dropbox Advanced Encryption" },
                        { feature: "End-to-end encrypted shared folders", anonli: "Drop files are E2EE", competitor: "Available for eligible team plans", source: "https://help.dropbox.com/security/dropbox-vault", sourceLabel: "Dropbox Encrypted Team Folders" },
                        { feature: "Password-protected links", anonli: "Paid Drop plans", competitor: "Paid Dropbox plans", source: "https://help.dropbox.com/share/set-link-permissions", sourceLabel: "Dropbox Shared Link Permissions" },
                        { feature: "Link expiration", anonli: "1-30 days by plan", competitor: "Paid Dropbox plans", source: "https://help.dropbox.com/share/set-link-permissions", sourceLabel: "Dropbox Shared Link Permissions" },
                        { feature: "Download limits", anonli: true, competitor: "Disable downloads on eligible plans", source: "https://help.dropbox.com/share/set-link-permissions", sourceLabel: "Dropbox Shared Link Permissions" },
                    ],
                },
                {
                    category: "Pricing & Product Scope",
                    items: [
                        { feature: "Free plan", anonli: "5GB Drop bandwidth + 10 random aliases", competitor: "Basic cloud storage plan", source: "https://www.dropbox.com/plans", sourceLabel: "Dropbox Plans" },
                        { feature: "Lowest paid plan for file sharing", anonli: "$2.99/mo Drop Plus", competitor: "Dropbox paid storage plan", source: "https://www.dropbox.com/plans", sourceLabel: "Dropbox Plans" },
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Choose Dropbox if you need persistent cloud storage, desktop sync, and team collaboration. Choose anon.li when the job is a private transfer with an expiring link, client-side encryption, and optional aliases in the same account.",
        anonliPros: ["Client-side encrypted transfers by default", "Email aliases included", "Lower-cost transfer plan", "Open source web app"],
        competitorPros: ["Mature sync clients", "Team collaboration", "Long-term storage", "Enterprise admin controls"],
        whoShouldUseData: {
            anonLi: ["Share sensitive files that should expire", "Need aliases and file transfers together", "Prefer a lightweight transfer workflow"],
            competitor: ["Need ongoing folder sync", "Collaborate on shared files with a team", "Want long-term cloud storage"],
        },
    },
    {
        id: "proton",
        slug: "proton",
        competitorName: "Proton",
        title: "anon.li vs Proton",
        description: "Proton is a broad privacy ecosystem covering mail, drive, VPN, password management, and more. anon.li focuses on aliases and encrypted file drops that work alongside your existing inbox.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://proton.me/pricing",
        sourceName: "Proton Pricing",
        comparisonData: {
            features: [
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Primary use case", anonli: "Aliases + encrypted file drops", competitor: "Private productivity suite" },
                        { feature: "Full mailbox hosting", anonli: false, competitor: true, source: "https://proton.me/mail", sourceLabel: "Proton Mail" },
                        { feature: "Encrypted cloud drive", anonli: "Transfer-focused Drop", competitor: true, source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "VPN included", anonli: false, competitor: "On Proton bundle plans", source: "https://proton.me/pricing", sourceLabel: "Proton Pricing" },
                        { feature: "Password manager included", anonli: false, competitor: true, source: "https://proton.me/pass", sourceLabel: "Proton Pass" },
                    ],
                },
                {
                    category: "Aliases & Forwarding",
                    items: [
                        { feature: "Works with your existing inbox", anonli: true, competitor: "Possible through SimpleLogin", source: "https://proton.me/support/creating-aliases", sourceLabel: "Proton Alias Support" },
                        { feature: "Free alias allowance", anonli: "10 random + 1 custom", competitor: "Proton address/alias limits vary by plan", source: "https://proton.me/support/creating-aliases", sourceLabel: "Proton Alias Support" },
                        { feature: "Custom domains for aliases", anonli: "Paid Alias plans", competitor: "Paid Proton plans", source: "https://proton.me/pricing", sourceLabel: "Proton Pricing" },
                        { feature: "PGP forwarding to another inbox", anonli: "Optional per recipient", competitor: "Native in Proton Mail ecosystem", source: "https://proton.me/support/pgp-key-management", sourceLabel: "Proton PGP Support" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "End-to-end encrypted file sharing", anonli: true, competitor: true, source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "Share with non-users", anonli: true, competitor: true, source: "https://proton.me/support/drive-shareable-link", sourceLabel: "Proton Drive Share Links" },
                        { feature: "Link password and expiration", anonli: true, competitor: true, source: "https://proton.me/support/drive-shareable-link", sourceLabel: "Proton Drive Share Links" },
                        { feature: "Transfer-first download limits", anonli: true, competitor: "Storage link controls", ...anonPricingSource },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Proton is stronger if you want to move your whole digital life into one encrypted ecosystem. anon.li is a better fit if you want aliases and encrypted drops without switching your email, VPN, calendar, or password manager.",
        anonliPros: ["Focused alias and drop workflow", "Works alongside any inbox", "Open source web app", "Lower entry price for single-purpose needs"],
        competitorPros: ["Full encrypted ecosystem", "Mature mailbox hosting", "Native apps", "Swiss jurisdiction"],
        whoShouldUseData: {
            anonLi: ["Want privacy tools without provider lock-in", "Need aliases plus one-off encrypted transfers", "Prefer a smaller focused product"],
            competitor: ["Want a full private email provider", "Need encrypted storage and documents", "Value a suite with VPN, calendar, and password manager"],
        },
    },
    {
        id: "google-drive",
        slug: "google-drive",
        competitorName: "Google Drive",
        title: "anon.li vs Google Drive",
        description: "Google Drive is optimized for collaboration and storage inside Google Workspace. anon.li is optimized for private, expiring file transfers and email alias workflows.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://workspace.google.com/products/drive/",
        sourceName: "Google Drive Product Page",
        comparisonData: {
            features: [
                {
                    category: "Best Fit",
                    items: [
                        { feature: "Primary use case", anonli: "Encrypted transfers + aliases", competitor: "Cloud storage and document collaboration" },
                        { feature: "Docs, Sheets, Slides collaboration", anonli: false, competitor: true, source: "https://workspace.google.com/products/drive/", sourceLabel: "Google Drive Product Page" },
                        { feature: "No-account recipient downloads", anonli: true, competitor: "Possible with public links", source: "https://support.google.com/drive/answer/2494822", sourceLabel: "Google Drive Sharing" },
                        { feature: "Email aliases included", anonli: true, competitor: "Gmail aliases depend on account setup" },
                    ],
                },
                {
                    category: "Privacy & Security",
                    items: [
                        { feature: "Client-side encryption by default", anonli: true, competitor: "Available only on supported Workspace editions", source: "https://support.google.com/a/answer/14311764", sourceLabel: "Google Workspace CSE" },
                        { feature: "Zero-knowledge file transfer model", anonli: "For Drop files", competitor: "Not the default Drive model", ...anonSecuritySource },
                        { feature: "Provider-side policy scanning", anonli: "Encrypted Drop content is unreadable to anon.li", competitor: "Google applies abuse and safety systems", source: "https://policies.google.com/privacy", sourceLabel: "Google Privacy Policy" },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                    ],
                },
                {
                    category: "Link Controls",
                    items: [
                        { feature: "Password-protected transfer links", anonli: "Paid Drop plans", competitor: "Not native for standard consumer Drive links", ...anonPricingSource },
                        { feature: "Auto-expiring transfers", anonli: "1-30 days by plan", competitor: "Workspace admin/link policies vary", ...anonPricingSource },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Free storage/transfer allowance", anonli: "5GB Drop bandwidth", competitor: "15GB Google account storage", source: "https://one.google.com/about/plans", sourceLabel: "Google One Plans" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Google Drive wins for collaborative documents and long-lived cloud folders. anon.li wins when you need a compact private transfer page, download limits, and aliases without putting the file into a larger ad-supported account ecosystem.",
        anonliPros: ["Client-side encrypted Drop links", "Download limits", "Aliases included", "No broader Google account dependency"],
        competitorPros: ["Real-time collaboration", "15GB account storage", "Deep Workspace integrations", "Mature mobile and desktop apps"],
        whoShouldUseData: {
            anonLi: ["Send sensitive files that should expire", "Need password/download controls on transfers", "Want privacy aliases alongside file sharing"],
            competitor: ["Collaborate in Docs/Sheets/Slides", "Need persistent folders", "Already run on Google Workspace"],
        },
    },
    {
        id: "wetransfer",
        slug: "wetransfer",
        competitorName: "WeTransfer",
        title: "anon.li vs WeTransfer",
        description: "WeTransfer is a recognizable transfer service with creative workflow features. anon.li gives similar link-based sharing with client-side encryption and email aliases.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-Changes-to-WeTransfer-plans-December-2024",
        sourceName: "WeTransfer Subscription Plans",
        comparisonData: {
            features: [
                {
                    category: "Transfer Limits",
                    items: [
                        { feature: "Free transfer size", anonli: "5GB with account; guest drops are shorter-lived", competitor: "3GB per transfer", source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-Changes-to-WeTransfer-plans-December-2024", sourceLabel: "WeTransfer Plans" },
                        { feature: "Largest published transfer tier", anonli: "250GB on Drop Pro", competitor: "300GB on Starter transfer tier", source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-Changes-to-WeTransfer-plans-December-2024", sourceLabel: "WeTransfer Plans" },
                        { feature: "Monthly cap on free transfers", anonli: "5GB bandwidth", competitor: "10 transfers and 3GB in 30 days", source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-Changes-to-WeTransfer-plans-December-2024", sourceLabel: "WeTransfer Plans" },
                        { feature: "No-account recipient downloads", anonli: true, competitor: true },
                    ],
                },
                {
                    category: "Security & Controls",
                    items: [
                        { feature: "Client-side encryption before upload", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Zero-knowledge file content", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Password protection", anonli: "Paid Drop plans", competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/209683553-Add-a-password-to-your-transfers", sourceLabel: "WeTransfer Passwords" },
                        { feature: "File requests", anonli: false, competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/19674802507410-Request-files", sourceLabel: "WeTransfer File Requests" },
                        { feature: "Download tracking", anonli: "Aggregate count", competitor: true, source: "https://help.wetransfer.com/hc/en-us/articles/26059761836306-How-to-Track-Your-Downloads-with-Access-Control", sourceLabel: "WeTransfer Access Control" },
                    ],
                },
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "Custom transfer branding", anonli: "Remove anon.li branding on Pro", competitor: "Paid plan feature", source: "https://help.wetransfer.com/hc/en-us/articles/23265597795346-Changes-to-WeTransfer-plans-December-2024", sourceLabel: "WeTransfer Plans" },
                        { feature: "Starting paid file-transfer plan", anonli: "$2.99/mo Drop Plus", competitor: "WeTransfer paid tier", ...anonPricingSource },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "WeTransfer is strong for familiar creative transfers, file requests, and branding. anon.li is the better pick when the same transfer should be encrypted in the browser before upload and tied to a privacy alias workflow.",
        anonliPros: ["Client-side encrypted Drop files", "Zero-knowledge transfer design", "Email aliases included", "Open source web app"],
        competitorPros: ["High paid transfer ceiling", "File requests", "Familiar recipient experience", "Branding and tracking tools"],
        whoShouldUseData: {
            anonLi: ["Send confidential files", "Want the provider unable to read file contents", "Need aliases and encrypted links together"],
            competitor: ["Need file request links", "Send large non-sensitive creative assets", "Want WeTransfer's brand familiarity"],
        },
    },
    {
        id: "simplelogin",
        slug: "simplelogin",
        competitorName: "SimpleLogin",
        title: "anon.li vs SimpleLogin",
        description: "SimpleLogin is an established open-source aliasing service owned by Proton. anon.li is an independent alternative that combines aliases with encrypted file drops.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://simplelogin.io/pricing/",
        sourceName: "SimpleLogin Pricing",
        comparisonData: {
            features: [
                {
                    category: "Alias Features",
                    items: [
                        { feature: "Free alias allowance", anonli: "10 random + 1 custom", competitor: "10 aliases", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Paid alias allowance", anonli: "Unlimited random + 100 custom on Pro", competitor: "Unlimited aliases", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Custom domains", anonli: "3 on Plus; 10 on Pro", competitor: "Unlimited on Premium", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Reply from alias", anonli: true, competitor: true, source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Mobile apps", anonli: false, competitor: true, source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file transfers", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "No-account recipient downloads", anonli: true, competitor: false },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Password-protected file drops", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Ownership & Pricing",
                    items: [
                        { feature: "Open source", anonli: true, competitor: true, source: "https://github.com/simple-login", sourceLabel: "SimpleLogin GitHub" },
                        { feature: "Independent company", anonli: true, competitor: "Owned by Proton", source: "https://proton.me/blog/proton-and-simplelogin-join-forces", sourceLabel: "Proton SimpleLogin Announcement" },
                        { feature: "Paid starting price", anonli: "$2.49/mo Alias Plus", competitor: "$36/year or $4 monthly", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                        { feature: "Browser extensions", anonli: "Firefox + Chrome", competitor: "Chrome, Firefox, Safari", source: "https://simplelogin.io/pricing/", sourceLabel: "SimpleLogin Pricing" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "SimpleLogin is still the more mature dedicated alias product. anon.li is better if you want a lower-cost independent alias service that also handles encrypted file transfers in the same dashboard.",
        anonliPros: ["Encrypted Drop included", "Independent", "Lower alias starting price", "Single account for aliases and file transfers"],
        competitorPros: ["Mature alias product", "Mobile apps", "Unlimited paid custom domains", "Proton integration"],
        whoShouldUseData: {
            anonLi: ["Need aliases and encrypted drops", "Prefer independent tools", "Want a simpler privacy suite"],
            competitor: ["Only need email aliases", "Need mobile alias apps today", "Want Proton ecosystem integration"],
        },
    },
    {
        id: "addy-io",
        slug: "addy-io",
        competitorName: "addy.io",
        title: "anon.li vs addy.io",
        description: "addy.io is a powerful open-source alias forwarding service with generous alias controls. anon.li pairs aliasing with encrypted file drops and higher free transfer bandwidth.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://addy.io/",
        sourceName: "addy.io Product and Pricing Page",
        comparisonData: {
            features: [
                {
                    category: "Alias Features",
                    items: [
                        { feature: "Primary use case", anonli: "Aliases + encrypted drops", competitor: "Anonymous email forwarding", source: "https://addy.io/", sourceLabel: "addy.io Product Page" },
                        { feature: "Free aliases", anonli: "10 random + 1 custom", competitor: "Unlimited standard + 10 shared-domain aliases", source: "https://addy.io/", sourceLabel: "addy.io Pricing" },
                        { feature: "Free monthly forwarding bandwidth", anonli: "No published alias bandwidth cap", competitor: "10MB", source: "https://addy.io/", sourceLabel: "addy.io Pricing" },
                        { feature: "Reply/send from aliases", anonli: "Replies supported", competitor: "Paid plans for anonymous send/reply limits", source: "https://addy.io/", sourceLabel: "addy.io Pricing" },
                        { feature: "GPG/OpenPGP forwarding", anonli: "Optional per recipient", competitor: true, source: "https://addy.io/", sourceLabel: "addy.io Features" },
                        { feature: "Custom domains", anonli: "Paid Alias plans", competitor: "Lite and Pro", source: "https://addy.io/", sourceLabel: "addy.io Pricing" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Client-side encrypted files", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "No-account recipient downloads", anonli: true, competitor: false },
                        { feature: "Download limits and expiry", anonli: true, competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Platform",
                    items: [
                        { feature: "Open source", anonli: true, competitor: true, source: "https://github.com/anonaddy", sourceLabel: "addy.io GitHub" },
                        { feature: "Mobile apps", anonli: false, competitor: true, source: "https://addy.io/", sourceLabel: "addy.io Product Page" },
                        { feature: "Browser extensions", anonli: "Firefox + Chrome", competitor: "Firefox, Chrome, Edge, Safari", source: "https://addy.io/", sourceLabel: "addy.io Product Page" },
                        { feature: "Paid starting price", anonli: "$2.49/mo Alias Plus", competitor: "$1/mo Lite billed yearly", source: "https://addy.io/", sourceLabel: "addy.io Pricing" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "addy.io is excellent if alias forwarding is the entire job and you can work within its bandwidth model. anon.li is the more complete option when aliases and encrypted file sharing need to live together.",
        anonliPros: ["Encrypted file drops", "Higher free Drop bandwidth", "No alias bandwidth language in pricing", "One dashboard for aliases and transfers"],
        competitorPros: ["Very strong alias feature depth", "Open source", "Low-cost Lite tier", "Mobile apps"],
        whoShouldUseData: {
            anonLi: ["Need private file sharing too", "Want transfer controls with aliases", "Prefer a simpler bundle"],
            competitor: ["Need advanced alias controls", "Want the cheapest alias-only paid tier", "Need mobile alias apps"],
        },
    },
    {
        id: "firefox-relay",
        slug: "firefox-relay",
        competitorName: "Firefox Relay",
        title: "anon.li vs Firefox Relay",
        description: "Firefox Relay is an easy email mask product from Mozilla. anon.li offers more free alias capacity and adds encrypted file transfers for privacy workflows beyond sign-up forms.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://relay.firefox.com/premium/",
        sourceName: "Firefox Relay Premium",
        comparisonData: {
            features: [
                {
                    category: "Masking & Forwarding",
                    items: [
                        { feature: "Free email masks", anonli: "10 random + 1 custom", competitor: "5 masks", source: "https://relay.firefox.com/premium/", sourceLabel: "Firefox Relay Premium" },
                        { feature: "Unlimited masks", anonli: "Paid Pro random aliases", competitor: "Premium plans", source: "https://relay.firefox.com/premium/", sourceLabel: "Firefox Relay Premium" },
                        { feature: "Unique domain for on-the-go masks", anonli: "Custom domains on paid plans", competitor: "Premium Relay domain", source: "https://relay.firefox.com/premium/", sourceLabel: "Firefox Relay Premium" },
                        { feature: "Reply anonymously", anonli: true, competitor: "Premium; up to 100 replies/day", source: "https://support.mozilla.org/en-US/kb/firefox-relay-premium-faq", sourceLabel: "Firefox Relay Premium FAQ" },
                        { feature: "Remove email trackers", anonli: "Known tracker removal in Alias", competitor: true, source: "https://relay.firefox.com/premium/", sourceLabel: "Firefox Relay Premium" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Password-protected transfer links", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                        { feature: "Expiring file links", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Platform Fit",
                    items: [
                        { feature: "Works outside Firefox", anonli: "Web, CLI, extension", competitor: "Web and browser extension", source: "https://support.mozilla.org/en-US/kb/firefox-relay-what-email-mask", sourceLabel: "Firefox Relay Help" },
                        { feature: "Phone masking", anonli: false, competitor: "Premium phone mask option", source: "https://relay.firefox.com/premium/", sourceLabel: "Firefox Relay Premium" },
                        { feature: "Open source public code", anonli: true, competitor: true, source: "https://github.com/mozilla/fx-private-relay", sourceLabel: "Firefox Relay GitHub" },
                        { feature: "Premium availability", anonli: "Available where anon.li operates", competitor: "Country-limited", source: "https://support.mozilla.org/en-US/kb/firefox-relay-premium-faq", sourceLabel: "Firefox Relay Premium FAQ" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Firefox Relay is polished for browser-based masking, especially for Firefox users and phone masking. anon.li is stronger when you want more free email aliases plus encrypted file transfers in the same privacy account.",
        anonliPros: ["More free aliases", "Encrypted Drop included", "CLI and API workflows", "Custom aliases on the free plan"],
        competitorPros: ["Mozilla brand trust", "Phone masking option", "Simple browser flow", "Tracker removal"],
        whoShouldUseData: {
            anonLi: ["Need aliases and file drops", "Want more free masks", "Need API or CLI access"],
            competitor: ["Use Firefox heavily", "Want phone masking", "Only need simple email masks"],
        },
    },
    {
        id: "duckduckgo-email-protection",
        slug: "duckduckgo-email-protection",
        competitorName: "DuckDuckGo Email Protection",
        title: "anon.li vs DuckDuckGo Email Protection",
        description: "DuckDuckGo Email Protection is a free tracker-removing forwarding service. anon.li adds managed aliases, paid custom-domain upgrades, and encrypted file sharing.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection/",
        sourceName: "DuckDuckGo Email Protection Help",
        comparisonData: {
            features: [
                {
                    category: "Email Privacy",
                    items: [
                        { feature: "Primary use case", anonli: "Alias management + encrypted drops", competitor: "Free forwarding and tracker removal", source: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection/", sourceLabel: "DuckDuckGo Email Protection Help" },
                        { feature: "Free aliases", anonli: "10 random + 1 custom", competitor: "Unlimited private Duck addresses", source: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection/", sourceLabel: "DuckDuckGo Email Protection Help" },
                        { feature: "Removes hidden email trackers", anonli: "Known tracker removal in Alias", competitor: true, source: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/privacy/", sourceLabel: "DuckDuckGo Email Privacy" },
                        { feature: "Stores forwarded messages", anonli: "Forwarding, not mailbox hosting", competitor: "Says it does not save email contents", source: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/privacy/", sourceLabel: "DuckDuckGo Email Privacy" },
                        { feature: "Custom domains", anonli: "Paid Alias plans", competitor: false },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file transfers", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Password-protected drops", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                        { feature: "No-account recipient downloads", anonli: true, competitor: false },
                    ],
                },
                {
                    category: "Product Model",
                    items: [
                        { feature: "Price", anonli: "Free plus paid upgrades", competitor: "Free", source: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection/", sourceLabel: "DuckDuckGo Email Protection Help" },
                        { feature: "API for aliases and drops", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Open source web app", anonli: true, competitor: "Partial/source varies by app", ...anonSourceCode },
                        { feature: "Requires DuckDuckGo browser or extension for setup", anonli: false, competitor: true, source: "https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection/", sourceLabel: "DuckDuckGo Email Protection Help" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "DuckDuckGo is hard to beat for a free tracker-removing forwarding address. anon.li is the better fit if you need managed alias limits, custom domains, an API, or encrypted file drops alongside email privacy.",
        anonliPros: ["Encrypted file sharing", "Custom-domain upgrade path", "API and CLI support", "Open source web app"],
        competitorPros: ["Free unlimited private addresses", "Tracker removal", "Simple DuckDuckGo setup", "No paid plan needed for basic use"],
        whoShouldUseData: {
            anonLi: ["Need custom domains or API access", "Share encrypted files", "Want an alias dashboard with paid limits"],
            competitor: ["Want a free tracker-removing address", "Already use DuckDuckGo apps", "Do not need file sharing"],
        },
    },
    {
        id: "icloud-hide-my-email",
        slug: "icloud-hide-my-email",
        competitorName: "iCloud Hide My Email",
        title: "anon.li vs iCloud Hide My Email",
        description: "Hide My Email is convenient for Apple users with iCloud+. anon.li is a cross-platform privacy suite with custom alias limits, APIs, and encrypted file drops.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://support.apple.com/guide/icloud/create-and-edit-addresses-mm1a876f7aed/icloud",
        sourceName: "Apple Hide My Email Support",
        comparisonData: {
            features: [
                {
                    category: "Alias Workflow",
                    items: [
                        { feature: "Primary use case", anonli: "Cross-platform aliases + drops", competitor: "Apple ecosystem email masking", source: "https://support.apple.com/guide/icloud/create-and-edit-addresses-mm1a876f7aed/icloud", sourceLabel: "Apple Hide My Email Support" },
                        { feature: "Subscription requirement", anonli: "Free plan available", competitor: "Requires iCloud+", source: "https://support.apple.com/guide/icloud/create-and-edit-addresses-mm1a876f7aed/icloud", sourceLabel: "Apple Hide My Email Support" },
                        { feature: "Random forwarding addresses", anonli: true, competitor: true, source: "https://support.apple.com/guide/icloud/create-and-edit-addresses-mm1a876f7aed/icloud", sourceLabel: "Apple Hide My Email Support" },
                        { feature: "Custom alias names", anonli: "1 free; more on paid plans", competitor: false },
                        { feature: "Change forwarding destination", anonli: true, competitor: "Apple account email addresses", source: "https://support.apple.com/guide/icloud/create-and-edit-addresses-mm1a876f7aed/icloud", sourceLabel: "Apple Hide My Email Support" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Link expiration and download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Password-protected drops", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                        { feature: "No-account recipient downloads", anonli: true, competitor: false },
                    ],
                },
                {
                    category: "Platform",
                    items: [
                        { feature: "Best native integration", anonli: "Browser dashboard, CLI, extension", competitor: "iPhone, iPad, Mac, Safari, Mail", source: "https://support.apple.com/guide/icloud/mm9d9012c9e8/icloud", sourceLabel: "Apple iCloud+ Setup" },
                        { feature: "API for automation", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "Custom domains for alias product", anonli: "Paid Alias plans", competitor: "Not Hide My Email's focus" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Hide My Email is the smoothest choice inside Apple forms and Mail. anon.li is stronger if you need platform-neutral aliases, API access, custom names, or encrypted file drops.",
        anonliPros: ["Cross-platform", "Encrypted Drop included", "Custom alias names", "API and CLI support"],
        competitorPros: ["Deep Apple integration", "Simple random addresses", "iCloud+ bundle value", "Works inside Safari and Mail"],
        whoShouldUseData: {
            anonLi: ["Use multiple platforms", "Need file sharing", "Want automations or custom aliases"],
            competitor: ["Live inside Apple devices", "Already pay for iCloud+", "Only need random forwarding addresses"],
        },
    },
    {
        id: "fastmail-masked-email",
        slug: "fastmail-masked-email",
        competitorName: "Fastmail Masked Email",
        title: "anon.li vs Fastmail Masked Email",
        description: "Fastmail Masked Email is a strong mailbox-integrated masking feature. anon.li is for users who want alias forwarding and encrypted file sharing without moving their mailbox.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://www.fastmail.help/hc/en-us/articles/4406536368911-Masked-Email",
        sourceName: "Fastmail Masked Email Help",
        comparisonData: {
            features: [
                {
                    category: "Email Masking",
                    items: [
                        { feature: "Primary use case", anonli: "Forwarding aliases + file drops", competitor: "Paid private mailbox with masks", source: "https://www.fastmail.help/hc/en-us/articles/4406536368911-Masked-Email", sourceLabel: "Fastmail Masked Email Help" },
                        { feature: "Masked addresses", anonli: "Free and paid alias limits", competitor: true, source: "https://www.fastmail.help/hc/en-us/articles/4406536368911-Masked-Email", sourceLabel: "Fastmail Masked Email Help" },
                        { feature: "Custom domains", anonli: "Paid Alias plans", competitor: "Fastmail plans support own domains", source: "https://www.fastmail.com/pricing/", sourceLabel: "Fastmail Pricing" },
                        { feature: "Send from masked address", anonli: "Reply from alias", competitor: true, source: "https://www.fastmail.help/hc/en-us/articles/4406536368911-Masked-Email", sourceLabel: "Fastmail Masked Email Help" },
                        { feature: "1Password/Bitwarden mask integrations", anonli: false, competitor: true, source: "https://www.fastmail.help/hc/en-us/articles/4406536368911-Masked-Email", sourceLabel: "Fastmail Masked Email Help" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file transfers", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Transfer expiry controls", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "No-account recipient downloads", anonli: true, competitor: false },
                    ],
                },
                {
                    category: "Product Fit",
                    items: [
                        { feature: "Requires mailbox migration", anonli: false, competitor: "Usually yes to get full value" },
                        { feature: "Mail/calendar/contact suite", anonli: false, competitor: true, source: "https://www.fastmail.com/pricing/", sourceLabel: "Fastmail Pricing" },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "Starting paid price", anonli: "$2.49/mo Alias Plus", competitor: "Fastmail paid mailbox plan", source: "https://www.fastmail.com/pricing/", sourceLabel: "Fastmail Pricing" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Fastmail is better if you want to pay for a complete, polished mailbox with masked email built in. anon.li is better if you want aliases that forward to your existing inbox plus encrypted drops.",
        anonliPros: ["No mailbox move required", "Encrypted file drops", "Open source web app", "Lower-cost alias-specific plan"],
        competitorPros: ["Excellent mailbox product", "Password-manager integrations", "Custom domain email hosting", "Calendar and contacts"],
        whoShouldUseData: {
            anonLi: ["Like your current inbox", "Need encrypted file transfers", "Want aliases as a standalone privacy layer"],
            competitor: ["Want a full paid mailbox", "Use 1Password or Bitwarden masked email workflows", "Need calendars and contacts"],
        },
    },
    {
        id: "startmail",
        slug: "startmail",
        competitorName: "StartMail",
        title: "anon.li vs StartMail",
        description: "StartMail is a private email provider with unlimited aliases and encrypted email features. anon.li keeps your current inbox and adds encrypted file drops.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://www.startmail.com/pricing",
        sourceName: "StartMail Pricing",
        comparisonData: {
            features: [
                {
                    category: "Email & Aliases",
                    items: [
                        { feature: "Primary use case", anonli: "Forwarding aliases + drops", competitor: "Private email mailbox", source: "https://www.startmail.com/pricing", sourceLabel: "StartMail Pricing" },
                        { feature: "Free plan", anonli: true, competitor: "7-day trial", source: "https://www.startmail.com/pricing", sourceLabel: "StartMail Pricing" },
                        { feature: "Unlimited aliases", anonli: "Unlimited random on Pro", competitor: true, source: "https://www.startmail.com/aliases/", sourceLabel: "StartMail Aliases" },
                        { feature: "Custom domain aliases", anonli: "Paid Alias plans", competitor: true, source: "https://support.startmail.com/hc/en-us/articles/5915017427997-Aliases-with-a-custom-domain", sourceLabel: "StartMail Domain Aliases" },
                        { feature: "One-click burner aliases", anonli: false, competitor: true, source: "https://www.startmail.com/aliases/", sourceLabel: "StartMail Aliases" },
                    ],
                },
                {
                    category: "Encryption",
                    items: [
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "PGP/encrypted email feature", anonli: "Forwarded-copy PGP optional", competitor: "Encrypted email product", source: "https://www.startmail.com/pricing", sourceLabel: "StartMail Pricing" },
                        { feature: "Send encrypted email from an alias", anonli: "PGP applies to forwarded copies", competitor: "Not from alias addresses", source: "https://support.startmail.com/hc/en-us/articles/18155654045213-Alias-Types", sourceLabel: "StartMail Alias Types" },
                        { feature: "Zero-knowledge Drop files", anonli: true, competitor: false, ...anonSecuritySource },
                    ],
                },
                {
                    category: "Product Fit",
                    items: [
                        { feature: "Requires changing email provider", anonli: false, competitor: true },
                        { feature: "Mailbox storage", anonli: false, competitor: "20GB Personal; 30GB Business", source: "https://www.startmail.com/pricing", sourceLabel: "StartMail Pricing" },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "Starting paid price", anonli: "$2.49/mo Alias Plus", competitor: "$4.99/mo billed annually", source: "https://www.startmail.com/pricing", sourceLabel: "StartMail Pricing" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "StartMail is better if you want a full private mailbox and unlimited aliases under that mailbox. anon.li is better if you want to keep your inbox and add aliases plus encrypted file transfers.",
        anonliPros: ["No provider switch", "Encrypted Drop included", "Free plan", "Lower alias starting price"],
        competitorPros: ["Full private email provider", "Unlimited aliases", "Encrypted email features", "Mailbox storage"],
        whoShouldUseData: {
            anonLi: ["Keep your existing mailbox", "Need encrypted file links", "Want a free alias starting point"],
            competitor: ["Want to replace Gmail/Outlook", "Need full private mailbox hosting", "Prefer unlimited aliases inside one mailbox"],
        },
    },
    {
        id: "burner-mail",
        slug: "burner-mail",
        competitorName: "Burner Mail",
        title: "anon.li vs Burner Mail",
        description: "Burner Mail focuses on disposable forwarding addresses. anon.li offers similar alias privacy with lower-cost paid aliasing and encrypted file drops.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://burnermail.io/premium",
        sourceName: "Burner Mail Premium",
        comparisonData: {
            features: [
                {
                    category: "Alias Features",
                    items: [
                        { feature: "Free burner addresses", anonli: "10 random + 1 custom", competitor: "5 burner addresses", source: "https://burnermail.io/premium", sourceLabel: "Burner Mail Premium" },
                        { feature: "Paid burner addresses", anonli: "Unlimited random on Pro", competitor: "Unlimited, with 30/day anti-abuse limit", source: "https://burnermail.io/premium", sourceLabel: "Burner Mail Premium" },
                        { feature: "Custom domains", anonli: "Paid Alias plans", competitor: "1 custom domain on Premium", source: "https://help.burnermail.io/what-are-custom-domains/", sourceLabel: "Burner Mail Custom Domains" },
                        { feature: "Reply with burner address", anonli: true, competitor: "Premium", source: "https://burnermail.io/premium", sourceLabel: "Burner Mail Premium" },
                        { feature: "Multiple recipients", anonli: "Paid Alias plans", competitor: "Premium", source: "https://burnermail.io/premium", sourceLabel: "Burner Mail Premium" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Password-protected drops", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                        { feature: "250GB transfer tier", anonli: true, competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Pricing & Trust",
                    items: [
                        { feature: "Paid starting price", anonli: "$2.49/mo Alias Plus", competitor: "$2.99/mo billed annually", source: "https://burnermail.io/premium", sourceLabel: "Burner Mail Premium" },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "No forwarded email storage", anonli: "Forwarding service", competitor: "Says forwarded emails are not stored", source: "https://burnermail.io/faq", sourceLabel: "Burner Mail FAQ" },
                        { feature: "Extension-focused generation", anonli: "Browser extension available", competitor: true, source: "https://mail.burnermail.io/", sourceLabel: "Burner Mail Product Page" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Burner Mail is a straightforward disposable-address product. anon.li is stronger if you want more free aliases, open-source transparency, and encrypted file sharing in the same privacy workflow.",
        anonliPros: ["More free aliases", "Encrypted file drops", "Open source web app", "Lower alias starting price"],
        competitorPros: ["Simple burner-address UX", "Premium custom domain", "Multiple recipients", "Browser extension workflow"],
        whoShouldUseData: {
            anonLi: ["Need file transfers too", "Want more free aliases", "Prefer auditable source"],
            competitor: ["Only need disposable forwarding", "Want a burner-specific interface", "Need a simple Chrome-focused flow"],
        },
    },
    {
        id: "33mail",
        slug: "33mail",
        competitorName: "33Mail",
        title: "anon.li vs 33Mail",
        description: "33Mail offers inexpensive disposable email forwarding with bandwidth-based plans. anon.li adds modern alias controls and encrypted file sharing.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://www.33mail.com/pricing",
        sourceName: "33Mail Pricing",
        comparisonData: {
            features: [
                {
                    category: "Alias Features",
                    items: [
                        { feature: "Free aliases", anonli: "10 random + 1 custom", competitor: "Unlimited aliases", source: "https://www.33mail.com/pricing", sourceLabel: "33Mail Pricing" },
                        { feature: "Free monthly forwarding bandwidth", anonli: "No published alias bandwidth cap", competitor: "10MB", source: "https://www.33mail.com/pricing", sourceLabel: "33Mail Pricing" },
                        { feature: "Anonymous replies", anonli: true, competitor: "Paid daily limits", source: "https://www.33mail.com/pricing", sourceLabel: "33Mail Pricing" },
                        { feature: "Custom domains", anonli: "Paid Alias plans", competitor: "Paid plans", source: "https://www.33mail.com/pricing", sourceLabel: "33Mail Pricing" },
                        { feature: "Multiple recipients per alias", anonli: "Paid Alias plans", competitor: "Not the main pricing focus" },
                    ],
                },
                {
                    category: "File Sharing",
                    items: [
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Expiring download links", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Password-protected drops", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Pricing & Product Age",
                    items: [
                        { feature: "Lowest paid alias plan", anonli: "$2.49/mo Alias Plus", competitor: "$1/mo Premium", source: "https://www.33mail.com/pricing", sourceLabel: "33Mail Pricing" },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "API for automation", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Best for", anonli: "Modern privacy suite", competitor: "Low-cost simple forwarding" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "33Mail is cheaper if all you need is lightweight alias forwarding with small bandwidth needs. anon.li is the better modern privacy suite because aliases, API access, and encrypted drops are all built into one product.",
        anonliPros: ["Encrypted Drop product", "Modern API and CLI", "Open source web app", "No 10MB free alias bandwidth cap stated"],
        competitorPros: ["Very low paid price", "Unlimited free aliases", "Simple disposable-email model", "Custom domains on paid plans"],
        whoShouldUseData: {
            anonLi: ["Need file sharing or APIs", "Want a modern dashboard", "Need larger privacy workflows than forwarding"],
            competitor: ["Want the cheapest simple alias forwarding", "Have low monthly email bandwidth", "Do not need file sharing"],
        },
    },
    {
        id: "forward-email",
        slug: "forward-email",
        competitorName: "Forward Email",
        title: "anon.li vs Forward Email",
        description: "Forward Email is a custom-domain forwarding and mailbox-hosting service. anon.li is a privacy suite for personal aliases and encrypted file drops.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://forwardemail.net/en",
        sourceName: "Forward Email Product Page",
        comparisonData: {
            features: [
                {
                    category: "Email Model",
                    items: [
                        { feature: "Primary use case", anonli: "Private aliases for any inbox", competitor: "Custom-domain email forwarding/hosting", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "Free forwarding", anonli: "Free anon.li aliases", competitor: "Free custom-domain forwarding", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "Custom domain focus", anonli: "Paid Alias plans", competitor: "Core product", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "Random shared-domain aliases", anonli: true, competitor: "Not the main product model" },
                        { feature: "Send mail on free plan", anonli: "Reply from aliases", competitor: "Free plan is forwarding only", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                    ],
                },
                {
                    category: "Security & Storage",
                    items: [
                        { feature: "Open source", anonli: true, competitor: true, source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "Encrypted mailbox hosting", anonli: false, competitor: "Paid plans", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "PGP forwarding", anonli: "Optional per recipient", competitor: true, source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "Encrypted file drops", anonli: true, competitor: false, ...anonSecuritySource },
                    ],
                },
                {
                    category: "Pricing & Scope",
                    items: [
                        { feature: "Paid starting price", anonli: "$2.49/mo Alias Plus", competitor: "$3/mo Enhanced Protection", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "API access", anonli: true, competitor: "Paid plan", source: "https://forwardemail.net/en", sourceLabel: "Forward Email Product Page" },
                        { feature: "Encrypted transfer links", anonli: true, competitor: false, ...anonSecuritySource },
                        { feature: "Best for", anonli: "Aliases + file transfers", competitor: "Domain owners who need email hosting" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Forward Email is better if you are mainly setting up email for domains. anon.li is better if you want personal alias privacy plus encrypted file transfers without needing to own a domain.",
        anonliPros: ["Random aliases without a domain", "Encrypted Drop included", "Lower alias starting price", "Consumer privacy workflow"],
        competitorPros: ["Custom-domain forwarding depth", "Mailbox hosting", "Open source", "Email standards and DNS focus"],
        whoShouldUseData: {
            anonLi: ["Do not own a domain", "Need encrypted file transfers", "Want aliases for personal signups"],
            competitor: ["Manage domain email", "Need custom-domain hosting", "Want free forwarding for unlimited domains"],
        },
    },
    {
        id: "proton-drive",
        slug: "proton-drive",
        competitorName: "Proton Drive",
        title: "anon.li vs Proton Drive",
        description: "Proton Drive is encrypted cloud storage with sharing links. anon.li Drop is a transfer-first alternative with download limits, short expiries, and aliases in the same account.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://proton.me/drive/security",
        sourceName: "Proton Drive Security",
        comparisonData: {
            features: [
                {
                    category: "Security",
                    items: [
                        { feature: "End-to-end encryption", anonli: true, competitor: true, source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "Zero-access / zero-knowledge file model", anonli: true, competitor: true, source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "Open source and audited apps", anonli: "Open source web app", competitor: true, source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "Key in URL fragment for transfers", anonli: true, competitor: "Drive share-link model", ...anonSecuritySource },
                    ],
                },
                {
                    category: "Sharing Controls",
                    items: [
                        { feature: "Password-protected links", anonli: "Paid Drop plans", competitor: true, source: "https://proton.me/support/drive-shareable-link", sourceLabel: "Proton Drive Share Links" },
                        { feature: "Link expiration", anonli: "1-30 days by plan", competitor: true, source: "https://proton.me/support/drive-shareable-link", sourceLabel: "Proton Drive Share Links" },
                        { feature: "Download limits", anonli: true, competitor: "Not a core share-link limit", ...anonPricingSource },
                        { feature: "No-account recipient access", anonli: true, competitor: true, source: "https://proton.me/support/drive-shareable-link", sourceLabel: "Proton Drive Share Links" },
                    ],
                },
                {
                    category: "Plans & Product Scope",
                    items: [
                        { feature: "Free file allowance", anonli: "5GB Drop bandwidth", competitor: "5GB free storage", source: "https://proton.me/drive/pricing", sourceLabel: "Proton Drive Pricing" },
                        { feature: "Paid storage/transfer focus", anonli: "50GB/250GB transfer tiers", competitor: "200GB Drive Plus; 500GB Proton Unlimited", source: "https://proton.me/drive/pricing", sourceLabel: "Proton Drive Pricing" },
                        { feature: "Email aliases included", anonli: true, competitor: "Via Proton/SimpleLogin ecosystem", source: "https://proton.me/drive/security", sourceLabel: "Proton Drive Security" },
                        { feature: "Document editor", anonli: false, competitor: true, source: "https://proton.me/drive/pricing", sourceLabel: "Proton Drive Pricing" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Proton Drive is better encrypted storage. anon.li Drop is better for privacy-first handoff links where expiry, download limits, and alias support matter more than storage sync.",
        anonliPros: ["Download limits", "Transfer-first UX", "Aliases included", "Lower Drop starting price"],
        competitorPros: ["Encrypted cloud storage", "Document and spreadsheet tools", "Native Proton apps", "Swiss ecosystem"],
        whoShouldUseData: {
            anonLi: ["Send files that should expire after limited access", "Need aliases with transfers", "Do not need a cloud drive"],
            competitor: ["Need encrypted storage", "Want Proton Docs/Sheets", "Already use Proton"],
        },
    },
    {
        id: "tresorit-send",
        slug: "tresorit-send",
        competitorName: "Tresorit Send",
        title: "anon.li vs Tresorit Send",
        description: "Tresorit Send is a free end-to-end encrypted transfer tool with a 5GB cap. anon.li Drop adds larger paid transfer tiers, account management, aliases, and APIs.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://support.tresorit.com/hc/en-us/articles/360007285294-What-is-Tresorit-Send",
        sourceName: "Tresorit Send Help",
        comparisonData: {
            features: [
                {
                    category: "Transfer Basics",
                    items: [
                        { feature: "Free max transfer", anonli: "5GB with account", competitor: "5GB per upload", source: "https://support.tresorit.com/hc/en-us/articles/360007285294-What-is-Tresorit-Send", sourceLabel: "Tresorit Send Help" },
                        { feature: "Paid larger transfer tiers", anonli: "50GB Plus; 250GB Pro", competitor: "Use Tresorit paid products", ...anonPricingSource },
                        { feature: "Files per upload", anonli: "Multiple files supported", competitor: "Up to 100 files", source: "https://support.tresorit.com/hc/en-us/articles/360007285294-What-is-Tresorit-Send", sourceLabel: "Tresorit Send Help" },
                        { feature: "Link lifetime", anonli: "1-30 days by plan", competitor: "7 days", source: "https://support.tresorit.com/hc/en-us/articles/360007285294-What-is-Tresorit-Send", sourceLabel: "Tresorit Send Help" },
                    ],
                },
                {
                    category: "Security & Controls",
                    items: [
                        { feature: "End-to-end encryption", anonli: true, competitor: true, source: "https://support.tresorit.com/hc/en-us/articles/216113777-What-is-Tresorit", sourceLabel: "Tresorit Security Overview" },
                        { feature: "Zero-knowledge architecture", anonli: true, competitor: true, source: "https://support.tresorit.com/hc/en-us/articles/216113777-What-is-Tresorit", sourceLabel: "Tresorit Security Overview" },
                        { feature: "Download count limit", anonli: "Configurable", competitor: "10 downloads per shared file", source: "https://support.tresorit.com/hc/en-us/articles/360007285294-What-is-Tresorit-Send", sourceLabel: "Tresorit Send Help" },
                        { feature: "Password protection", anonli: "Paid Drop plans", competitor: "Tresorit link controls on paid products", source: "https://tresorit.com/pricing/file-sharing", sourceLabel: "Tresorit FileSharing Pricing" },
                    ],
                },
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "API for transfers", anonli: true, competitor: "Tresorit business integrations", ...anonPricingSource },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "Enterprise compliance suite", anonli: false, competitor: true, source: "https://tresorit.com/pricing/file-sharing", sourceLabel: "Tresorit FileSharing Pricing" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Tresorit Send is a strong free encrypted transfer option at 5GB. anon.li is better when you need larger transfers, longer account-managed controls, aliases, and programmatic workflows.",
        anonliPros: ["Larger paid transfer tiers", "Download limits", "Aliases included", "API and CLI workflows"],
        competitorPros: ["Free E2EE transfers", "Strong security brand", "Simple standalone sender", "Tresorit enterprise path"],
        whoShouldUseData: {
            anonLi: ["Need more than 5GB", "Need aliases or APIs", "Want account-managed drops"],
            competitor: ["Need a quick free 5GB encrypted transfer", "Already trust Tresorit", "Need enterprise compliance products"],
        },
    },
    {
        id: "swisstransfer",
        slug: "swisstransfer",
        competitorName: "SwissTransfer",
        title: "anon.li vs SwissTransfer",
        description: "SwissTransfer offers free, high-capacity transfers from Infomaniak. anon.li trades the larger free cap for browser-side encryption, aliases, and paid privacy controls.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://www.infomaniak.com/en/support/faq/2451/getting-started-swisstransfer",
        sourceName: "Infomaniak SwissTransfer Guide",
        comparisonData: {
            features: [
                {
                    category: "Transfer Limits",
                    items: [
                        { feature: "Free transfer size", anonli: "5GB with account", competitor: "50GB", source: "https://www.infomaniak.com/en/support/faq/2451/getting-started-swisstransfer", sourceLabel: "Infomaniak SwissTransfer Guide" },
                        { feature: "No registration required", anonli: "Guest drops are available with shorter limits", competitor: true, source: "https://apps.apple.com/us/app/infomaniak-swisstransfer/id6737686335", sourceLabel: "SwissTransfer App Store Listing" },
                        { feature: "Paid larger transfer tier", anonli: "250GB Drop Pro", competitor: "kDrive sharing upgrades", source: "https://www.infomaniak.com/en/swisstransfer-kdrive", sourceLabel: "SwissTransfer kDrive" },
                        { feature: "Availability restrictions", anonli: "Service policy applies", competitor: "Some countries restricted for creation", source: "https://www.infomaniak.com/en/support/faq/2451/getting-started-swisstransfer", sourceLabel: "Infomaniak SwissTransfer Guide" },
                    ],
                },
                {
                    category: "Security & Controls",
                    items: [
                        { feature: "Client-side end-to-end encryption", anonli: true, competitor: "SSL/TLS and hosted data controls", source: "https://apps.apple.com/us/app/infomaniak-swisstransfer/id6737686335", sourceLabel: "SwissTransfer App Store Listing" },
                        { feature: "Password protection", anonli: "Paid Drop plans", competitor: true, source: "https://apps.apple.com/us/app/infomaniak-swisstransfer/id6737686335", sourceLabel: "SwissTransfer App Store Listing" },
                        { feature: "Download limits", anonli: true, competitor: true, source: "https://apps.apple.com/us/app/infomaniak-swisstransfer/id6737686335", sourceLabel: "SwissTransfer App Store Listing" },
                        { feature: "Expiration dates", anonli: "1-30 days by plan", competitor: true, source: "https://apps.apple.com/us/app/infomaniak-swisstransfer/id6737686335", sourceLabel: "SwissTransfer App Store Listing" },
                        { feature: "Data hosted in Switzerland", anonli: false, competitor: true, source: "https://news.infomaniak.com/en/swisstransfer-free-large-file-transfer/", sourceLabel: "Infomaniak SwissTransfer Launch" },
                    ],
                },
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "API and CLI", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Best for", anonli: "Encrypted privacy suite", competitor: "Large free non-account transfers" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "SwissTransfer wins on free file size and no-registration convenience. anon.li is better when browser-side encryption, source transparency, aliases, and API-driven workflows are the priority.",
        anonliPros: ["Client-side encrypted Drop", "Email aliases included", "Open source web app", "API and CLI"],
        competitorPros: ["50GB free transfers", "No registration", "Swiss hosting", "Password/expiry/download controls"],
        whoShouldUseData: {
            anonLi: ["Prioritize end-to-end encrypted file contents", "Need aliases too", "Need API or CLI workflows"],
            competitor: ["Need to send up to 50GB free", "Want no account friction", "Prefer Swiss-hosted transfer infrastructure"],
        },
    },
    {
        id: "wormhole",
        slug: "wormhole",
        competitorName: "Wormhole",
        title: "anon.li vs Wormhole",
        description: "Wormhole is a simple end-to-end encrypted transfer service up to 10GB. anon.li adds paid larger transfers, download limits, account history, aliases, and APIs.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://wormhole.app/",
        sourceName: "Wormhole Product Page",
        comparisonData: {
            features: [
                {
                    category: "Encryption",
                    items: [
                        { feature: "End-to-end encrypted transfers", anonli: true, competitor: true, source: "https://wormhole.app/", sourceLabel: "Wormhole Product Page" },
                        { feature: "Browser-side encryption", anonli: true, competitor: true, source: "https://wormhole.app/security", sourceLabel: "Wormhole Security" },
                        { feature: "Key kept out of server request", anonli: "URL fragment key", competitor: "URL fragment key", source: "https://wormhole.app/security", sourceLabel: "Wormhole Security" },
                        { feature: "Encryption algorithm", anonli: "AES-256-GCM", competitor: "AES-128-GCM", source: "https://wormhole.app/security", sourceLabel: "Wormhole Security" },
                    ],
                },
                {
                    category: "Transfer Controls",
                    items: [
                        { feature: "Free max transfer", anonli: "5GB with account", competitor: "10GB", source: "https://wormhole.app/", sourceLabel: "Wormhole Product Page" },
                        { feature: "Paid larger transfer tier", anonli: "250GB Drop Pro", competitor: false, ...anonPricingSource },
                        { feature: "Download limits", anonli: true, competitor: "Auto-expiring link model", ...anonPricingSource },
                        { feature: "Password-protected drops", anonli: "Paid Drop plans", competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "Account dashboard for drops", anonli: true, competitor: "Transfer-first page" },
                        { feature: "API for drops", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "No ads or trackers claim", anonli: "Privacy-respecting analytics on non-sensitive pages", competitor: true, source: "https://wormhole.app/security", sourceLabel: "Wormhole Security" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Wormhole is one of the closest privacy matches for quick encrypted transfers. anon.li is better if you need bigger paid drops, download limits, password controls, aliasing, or API automation.",
        anonliPros: ["250GB paid tier", "Download limits", "Password-protected paid drops", "Aliases and API"],
        competitorPros: ["Simple E2EE transfers", "10GB free transfers", "Fragment-key design", "No-account simplicity"],
        whoShouldUseData: {
            anonLi: ["Need larger account-managed transfers", "Want aliases in the same tool", "Need API or CLI workflows"],
            competitor: ["Need a quick 10GB encrypted link", "Want minimal transfer UX", "Do not need aliasing"],
        },
    },
    {
        id: "pcloud-transfer",
        slug: "pcloud-transfer",
        competitorName: "pCloud Transfer",
        title: "anon.li vs pCloud Transfer",
        description: "pCloud Transfer is a free no-registration transfer tool with optional password encryption. anon.li offers client-side encrypted drops, account controls, aliases, and larger paid tiers.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://transfer.pcloud.com/",
        sourceName: "pCloud Transfer",
        comparisonData: {
            features: [
                {
                    category: "Transfer Basics",
                    items: [
                        { feature: "Free transfer limit", anonli: "5GB with account", competitor: "Up to 5GB total", source: "https://transfer.pcloud.com/", sourceLabel: "pCloud Transfer" },
                        { feature: "Per-file limit", anonli: "5GB Free; 250GB Pro", competitor: "200MB per single file", source: "https://transfer.pcloud.com/", sourceLabel: "pCloud Transfer" },
                        { feature: "No registration required", anonli: "Guest drops are available with shorter limits", competitor: true, source: "https://transfer.pcloud.com/", sourceLabel: "pCloud Transfer" },
                        { feature: "Paid larger transfer tier", anonli: "250GB Drop Pro", competitor: "pCloud account products", ...anonPricingSource },
                    ],
                },
                {
                    category: "Security & Controls",
                    items: [
                        { feature: "Client-side encrypted drops by default", anonli: true, competitor: "Optional password encryption", source: "https://transfer.pcloud.com/", sourceLabel: "pCloud Transfer" },
                        { feature: "Zero-knowledge transfer design", anonli: true, competitor: "pCloud Crypto is separate from Transfer", source: "https://pcdn-www.pcloud.com/help/general-help-center/what-is-pcloud-encryption", sourceLabel: "pCloud Encryption" },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Account-managed drop history", anonli: true, competitor: false, ...anonPricingSource },
                    ],
                },
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "API and CLI", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Open source web app", anonli: true, competitor: false, ...anonSourceCode },
                        { feature: "Best for", anonli: "Managed private drops", competitor: "Quick no-account transfer" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "pCloud Transfer is useful for quick free transfers, especially when no account is desired. anon.li is more complete for sensitive files because encryption is the default Drop model and paid plans add larger sizes and controls.",
        anonliPros: ["Default client-side Drop encryption", "Larger paid transfers", "Download limits", "Aliases and API"],
        competitorPros: ["No-registration free transfer", "Optional password encryption", "Simple email/link flow", "pCloud ecosystem"],
        whoShouldUseData: {
            anonLi: ["Need managed encrypted file drops", "Need more than pCloud Transfer's per-file cap", "Want aliases too"],
            competitor: ["Need a quick no-account 5GB transfer", "Do not need download limits", "Already use pCloud"],
        },
    },
    {
        id: "internxt-send",
        slug: "internxt-send",
        competitorName: "Internxt Send",
        title: "anon.li vs Internxt Send",
        description: "Internxt Send is a free encrypted transfer tool with a 5GB cap and 15-day links. anon.li Drop adds aliases, download limits, APIs, and larger paid transfer tiers.",
        lastVerified: LAST_VERIFIED,
        sourceUrl: "https://help.internxt.com/en/articles/5358991-what-is-internxt-send",
        sourceName: "Internxt Send Help",
        comparisonData: {
            features: [
                {
                    category: "Transfer Basics",
                    items: [
                        { feature: "Free max send", anonli: "5GB with account", competitor: "5GB", source: "https://help.internxt.com/en/articles/6534031-is-there-a-limit-to-the-size-of-folders-or-files", sourceLabel: "Internxt Send Limits" },
                        { feature: "Link lifetime", anonli: "1-30 days by plan", competitor: "15 days", source: "https://help.internxt.com/en/articles/5358991-what-is-internxt-send", sourceLabel: "Internxt Send Help" },
                        { feature: "Paid larger transfer tier", anonli: "250GB Drop Pro", competitor: "Internxt Drive sharing limits differ", ...anonPricingSource },
                        { feature: "No-account recipient access", anonli: true, competitor: true, source: "https://help.internxt.com/en/articles/5358991-what-is-internxt-send", sourceLabel: "Internxt Send Help" },
                    ],
                },
                {
                    category: "Security",
                    items: [
                        { feature: "Encrypted file sharing", anonli: true, competitor: true, source: "https://help.internxt.com/en/articles/5358991-what-is-internxt-send", sourceLabel: "Internxt Send Help" },
                        { feature: "Zero-knowledge storage architecture", anonli: true, competitor: true, source: "https://help.internxt.com/en/articles/5359488-can-internxt-access-my-files", sourceLabel: "Internxt Privacy Help" },
                        { feature: "Open source", anonli: true, competitor: true, source: "https://internxt.com/", sourceLabel: "Internxt Product Page" },
                        { feature: "Password-protected drops", anonli: "Paid Drop plans", competitor: "Available in Internxt Drive sharing", source: "https://help.internxt.com/en/articles/11563411-how-to-encrypt-a-file-with-a-password-with-internxt-drive", sourceLabel: "Internxt Password Sharing" },
                    ],
                },
                {
                    category: "Product Scope",
                    items: [
                        { feature: "Email aliases included", anonli: true, competitor: false },
                        { feature: "Download limits", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "API and CLI", anonli: true, competitor: false, ...anonPricingSource },
                        { feature: "Cloud storage suite", anonli: false, competitor: true, source: "https://internxt.com/", sourceLabel: "Internxt Product Page" },
                    ],
                },
            ],
            pricing: [],
        },
        bottomLine: "Internxt Send is a credible encrypted 5GB transfer option. anon.li is better if your transfer workflow also needs aliases, download limits, APIs, or file sizes above 5GB.",
        anonliPros: ["Larger paid file transfers", "Download limits", "Aliases included", "API and CLI"],
        competitorPros: ["Free encrypted Send tool", "Open source", "Zero-knowledge cloud suite", "15-day links"],
        whoShouldUseData: {
            anonLi: ["Need more than 5GB", "Need alias privacy too", "Want account-managed transfer controls"],
            competitor: ["Need a free 5GB encrypted link", "Already use Internxt Drive", "Want a broader encrypted storage suite"],
        },
    },
]

export function getComparison(slug: string) {
    return comparisons.find((c) => c.slug === slug)
}
