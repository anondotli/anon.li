"use client"

import { useState } from "react"
import { 
    Package, 
    Mail, 
    Shield, 
    FileUp, 
    Code, 
    CreditCard,
    ChevronDown,
    Search,
    HelpCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FAQItem {
    question: string
    answer: React.ReactNode
}

interface FAQCategory {
    id: string
    name: string
    icon: React.ElementType
    description: string
    items: FAQItem[]
}

const FAQ_CATEGORIES: FAQCategory[] = [
    {
        id: "plans",
        name: "Plans & Pricing",
        icon: Package,
        description: "Understanding our plans",
        items: [
            {
                question: "What's the difference between Bundle, Alias, and Drop?",
                answer: (
                    <>
                        <strong>Bundle</strong> gives you access to both Alias and Drop features at a discounted price - best value if you want everything. <strong>Alias</strong> is for email aliasing only - create private addresses to protect your inbox. <strong>Drop</strong> is for encrypted file sharing. Choose what fits your needs.
                    </>
                )
            },
            {
                question: "Can I change plans at any time?",
                answer: "Yes! Upgrade or downgrade from your dashboard anytime. Upgrades are prorated, downgrades take effect at the end of your billing period."
            },
            {
                question: "Do you offer annual billing?",
                answer: "Yes! Save up to 25% with annual billing. Switch between monthly and annual anytime from your billing dashboard."
            },
            {
                question: "What happens if I exceed my plan limits?",
                answer: "We don't charge overage fees. You'll need to upgrade or delete existing items to create new ones. Your existing aliases and drops keep working."
            },
            {
                question: "Do you offer discounts?",
                answer: "We keep prices low for everyone. Annual billing saves up to 25%. Our free plan is generous and always available."
            }
        ]
    },
    {
        id: "email",
        name: "Email Aliases",
        icon: Mail,
        description: "How email forwarding works",
        items: [
            {
                question: "What's the difference between random and custom aliases?",
                answer: (
                    <>
                        <strong>Random aliases</strong> are auto-generated (like <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">x7k9m@anon.li</code>) - quick and private. <strong>Custom aliases</strong> let you choose (like <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">shopping@anon.li</code>) - easier to remember.
                    </>
                )
            },
            {
                question: "Can I use my own domain?",
                answer: "Yes! Plus (3 domains) and Pro (10 domains) plans support custom domains. Add your domain, configure DNS, and create aliases on your own domain."
            },
            {
                question: "Can I send emails from my aliases?",
                answer: "Yes! Reply to any forwarded email and your response will appear to come from your alias. The recipient never sees your real email address."
            },
            {
                question: "What happens to aliases if I downgrade?",
                answer: "Your aliases keep working and forwarding for a grace period, but if you remain over the free-tier limits after downgrade, excess resources can be scheduled for removal and later deleted. Upgrade again during that window to keep everything."
            },
            {
                question: "Which email providers work?",
                answer: "All of them! Gmail, Outlook, ProtonMail, iCloud, Yahoo, or your own server. If it receives email, we can forward to it."
            }
        ]
    },
    {
        id: "security",
        name: "Security & Privacy",
        icon: Shield,
        description: "How we protect your data",
        items: [
            {
                question: "Is PGP encryption included?",
                answer: "Yes, on all plans including free! Add your public key and we'll encrypt all forwarded emails before sending them to you."
            },
            {
                question: "How is file encryption handled?",
                answer: "Files are encrypted in your browser using AES-256-GCM before upload. The key never leaves your device - it's in the share link. We cannot decrypt your files."
            },
            {
                question: "Can I audit your security?",
                answer: (
                    <>
                        Yes! Our platform code is open source at <a href="https://codeberg.org/anonli/anon.li" className="text-primary hover:underline">codeberg.org/anonli/anon.li</a>. We believe in open source security over blind trust.
                    </>
                )
            },
            {
                question: "Do you log email contents or drop data?",
                answer: "No. Emails are processed in memory and forwarded immediately - nothing stored. Drops are encrypted client-side, so we only store encrypted data we can't read."
            }
        ]
    },
    {
        id: "drops",
        name: "File Sharing",
        icon: FileUp,
        description: "Upload and share securely",
        items: [
            {
                question: "What's the maximum drop size?",
                answer: "Free: up to 5GB. Plus: up to 50GB. Pro: up to 250GB. We use chunked uploads for reliable large file transfers."
            },
            {
                question: "How long are drops stored?",
                answer: "Free: 3 days. Plus: 7 days. Pro: 30 days. You can always choose a shorter expiration. Expired drops are permanently deleted."
            },
            {
                question: "What are download limits?",
                answer: "Set a max number of downloads for any drop. Once reached, the drop auto-deletes. Perfect for sensitive documents."
            },
            {
                question: "How much bandwidth do I get?",
                answer: "Free: 5GB. Plus: 50GB. Pro: 250GB. Each upload counts toward your limit."
            },
            {
                question: "Can recipients download without an account?",
                answer: "Yes! Anyone with the link can download - no account needed. Decryption happens automatically in their browser."
            }
        ]
    },
    {
        id: "technical",
        name: "API & Technical",
        icon: Code,
        description: "For developers",
        items: [
            {
                question: "Do you offer an API?",
                answer: "Yes! Full REST API for aliases, domains, and drops. Free: 500 requests/month. Plus: 25,000. Pro: 100,000. Docs in your dashboard."
            },
            {
                question: "Is there a browser extension?",
                answer: "Yes. The anon.li browser extension is available alongside our CLI tool, so you can manage aliases and drops either in the browser or from the terminal."
            }
        ]
    },
    {
        id: "billing",
        name: "Billing & Account",
        icon: CreditCard,
        description: "Payments and your account",
        items: [
            {
                question: "What payment methods do you accept?",
                answer: "All major cards via Stripe, plus Apple Pay, Google Pay, and Link. We also support cryptocurrency checkout through NOWPayments. Available coins and networks depend on NOWPayments at checkout, and crypto purchases give you 1 year of access per payment with no recurring billing."
            },
            {
                question: "Do you offer refunds?",
                answer: "Generally no, due to abuse risk. But contact support within 14 days if you have technical issues preventing use."
            },
            {
                question: "Can I use anon.li for my team?",
                answer: "Currently individual accounts only. Team features with shared domains and admin controls are in development."
            },
            {
                question: "How do I delete my account?",
                answer: "Settings → Delete Account. This permanently removes all your data including aliases, drops, and domains. Cannot be undone."
            }
        ]
    }
]

function FAQItem({ item, isOpen, onToggle }: { item: FAQItem; isOpen: boolean; onToggle: () => void }) {
    return (
        <div 
            className={cn(
                "rounded-xl transition-all duration-200",
                isOpen ? "bg-secondary/50" : "hover:bg-secondary/30"
            )}
        >
            <button
                onClick={onToggle}
                className="w-full flex items-start justify-between gap-4 p-4 text-left"
            >
                <span className="font-medium text-sm leading-relaxed">{item.question}</span>
                <ChevronDown 
                    className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 mt-0.5",
                        isOpen && "rotate-180"
                    )} 
                />
            </button>
            <div 
                className={cn(
                    "grid transition-all duration-200",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="overflow-hidden">
                    <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                        {item.answer}
                    </p>
                </div>
            </div>
        </div>
    )
}

function CategoryCard({ 
    category, 
    isActive, 
    onClick 
}: { 
    category: FAQCategory
    isActive: boolean
    onClick: () => void 
}) {
    const Icon = category.icon
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-2xl transition-all duration-200 text-center min-w-[100px]",
                isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
            )}
        >
            <Icon className="h-5 w-5" />
            <span className="text-xs font-medium">{category.name}</span>
        </button>
    )
}

export function PricingFAQ() {
    const [activeCategory, setActiveCategory] = useState<string>("plans")
    const [openItems, setOpenItems] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState("")

    const toggleItem = (categoryId: string, index: number) => {
        const key = `${categoryId}-${index}`
        const newOpenItems = new Set(openItems)
        if (newOpenItems.has(key)) {
            newOpenItems.delete(key)
        } else {
            newOpenItems.add(key)
        }
        setOpenItems(newOpenItems)
    }

    const currentCategory = FAQ_CATEGORIES.find(c => c.id === activeCategory)

    // Filter items based on search
    const filteredCategories = searchQuery.trim() 
        ? FAQ_CATEGORIES.map(cat => ({
            ...cat,
            items: cat.items.filter(item => 
                item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (typeof item.answer === 'string' && item.answer.toLowerCase().includes(searchQuery.toLowerCase()))
            )
        })).filter(cat => cat.items.length > 0)
        : null

    return (
        <div className="max-w-4xl mx-auto border-t border-border/50 pt-24">
            {/* Header */}
            <div className="text-center mb-12 space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-2">
                    <HelpCircle className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
                    Questions? We&apos;ve got answers.
                </h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                    Everything you need to know about anon.li. Can&apos;t find what you&apos;re looking for? <a href="mailto:hi@anon.li" className="text-primary hover:underline">Contact us</a>.
                </p>
            </div>

            {/* Search */}
            <div className="relative max-w-md mx-auto mb-10">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Search questions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-full bg-secondary/50 border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
            </div>

            {/* Search Results */}
            {filteredCategories ? (
                <div className="space-y-8">
                    {filteredCategories.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No results found for &quot;{searchQuery}&quot;</p>
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="text-primary hover:underline mt-2 text-sm"
                            >
                                Clear search
                            </button>
                        </div>
                    ) : (
                        filteredCategories.map(category => (
                            <div key={category.id} className="space-y-3">
                                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                    <category.icon className="h-4 w-4" />
                                    {category.name}
                                </div>
                                <div className="space-y-2">
                                    {category.items.map((item, idx) => (
                                        <FAQItem
                                            key={idx}
                                            item={item}
                                            isOpen={openItems.has(`${category.id}-${idx}`)}
                                            onToggle={() => toggleItem(category.id, idx)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <>
                    {/* Category Pills */}
                    <div className="flex flex-wrap justify-center gap-3 mb-10">
                        {FAQ_CATEGORIES.map(category => (
                            <CategoryCard
                                key={category.id}
                                category={category}
                                isActive={activeCategory === category.id}
                                onClick={() => setActiveCategory(category.id)}
                            />
                        ))}
                    </div>

                    {/* Category Content */}
                    {currentCategory && (
                        <div className="bg-card rounded-3xl border border-border/50 p-6 md:p-8">
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/50">
                                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                                    <currentCategory.icon className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-medium font-serif text-lg">{currentCategory.name}</h3>
                                    <p className="text-sm text-muted-foreground">{currentCategory.description}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {currentCategory.items.map((item, idx) => (
                                    <FAQItem
                                        key={idx}
                                        item={item}
                                        isOpen={openItems.has(`${currentCategory.id}-${idx}`)}
                                        onToggle={() => toggleItem(currentCategory.id, idx)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
