import { KeyRound, ShieldCheck, Globe, Lock, Github, Bitcoin } from "lucide-react";

/**
 * Privacy/trust signals shown on the pricing page to make the "why pay for this
 * vs. a generic alias service" argument explicit. Each item is a concrete,
 * verifiable feature — not marketing fluff.
 */
const SIGNALS = [
    {
        icon: KeyRound,
        title: "PGP-encrypted forwarding",
        detail: "Included on every plan, free included.",
    },
    {
        icon: ShieldCheck,
        title: "2FA with TOTP",
        detail: "Protect your account with any authenticator.",
    },
    {
        icon: Globe,
        title: "Custom domains",
        detail: "Use your own domain on Plus and Pro.",
    },
    {
        icon: Lock,
        title: "Zero-knowledge file drops",
        detail: "Encrypted in your browser — we can't read them.",
    },
    {
        icon: Github,
        title: "Open source",
        detail: "Full platform, CLI, extension, and MCP server.",
    },
    {
        icon: Bitcoin,
        title: "Pay in crypto",
        detail: "BTC, ETH, XMR, and more via NOWPayments.",
    },
] as const;

export function PricingTrustRow() {
    return (
        <div className="mx-auto mb-12 max-w-5xl rounded-3xl border border-border/50 bg-secondary/20 p-6 md:p-8">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                {SIGNALS.map((signal) => {
                    const Icon = signal.icon;
                    return (
                        <div
                            key={signal.title}
                            className="flex flex-col items-center text-center gap-2"
                        >
                            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Icon className="h-5 w-5" aria-hidden />
                            </div>
                            <p className="text-xs font-medium leading-tight">{signal.title}</p>
                            <p className="text-[11px] text-muted-foreground leading-snug hidden md:block">
                                {signal.detail}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
