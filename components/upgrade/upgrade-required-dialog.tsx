"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils";

interface UpgradeRequiredDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    details: UpgradeRequiredDetails | null;
}

const SCOPE_COPY: Record<UpgradeRequiredDetails["scope"], { title: string; reason: string; highlight: string }> = {
    alias_random: {
        title: "Random alias limit reached",
        reason: "Get more random aliases plus custom domains, PGP encryption, and a higher API quota.",
        highlight: "alias",
    },
    alias_custom: {
        title: "Custom alias limit reached",
        reason: "Lock in more memorable custom aliases on your own domains.",
        highlight: "alias",
    },
    alias_domains: {
        title: "Custom domain limit reached",
        reason: "Add more verified domains for branded forwarding.",
        highlight: "alias",
    },
    alias_recipients: {
        title: "Recipient limit reached",
        reason: "Forward to more verified recipients across aliases.",
        highlight: "alias",
    },
    alias_recipients_per_alias: {
        title: "Recipients per alias limit reached",
        reason: "Route a single alias to multiple recipients.",
        highlight: "alias",
    },
    drop_file_size: {
        title: "File size limit reached",
        reason: "Upload larger files with generous bandwidth headroom.",
        highlight: "drop",
    },
    drop_bandwidth: {
        title: "Bandwidth limit reached",
        reason: "More monthly bandwidth and longer expiry for your drops.",
        highlight: "drop",
    },
    drop_expiry: {
        title: "Expiry limit reached",
        reason: "Keep drops live for longer.",
        highlight: "drop",
    },
    drop_custom_key: {
        title: "Password protection is a paid feature",
        reason: "Add a password layer on top of end-to-end encryption.",
        highlight: "drop",
    },
    form_forms: {
        title: "Form limit reached",
        reason: "Create more encrypted forms for separate intake flows.",
        highlight: "form",
    },
    form_branding: {
        title: "Branding removal requires Pro",
        reason: "Remove anon.li branding from public form pages.",
        highlight: "form",
    },
    form_custom_key: {
        title: "Password protection is a paid feature",
        reason: "Require a password before visitors can view or submit a form.",
        highlight: "form",
    },
    form_file_uploads: {
        title: "File uploads require an upgrade",
        reason: "Accept encrypted file attachments with form submissions.",
        highlight: "form",
    },
    form_submissions: {
        title: "Submission limit reached",
        reason: "Accept more encrypted form submissions each month.",
        highlight: "form",
    },
};

export function UpgradeRequiredDialog({ open, onOpenChange, details }: UpgradeRequiredDialogProps) {
    if (!details) return null;
    const copy = SCOPE_COPY[details.scope];
    const planLabel = details.suggestedTier === "pro" ? "Pro" : "Plus";
    const pricingHref = `/pricing?highlight=${copy.highlight}_${details.suggestedTier}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/15">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <DialogTitle>{copy.title}</DialogTitle>
                    </div>
                    <DialogDescription className="pt-2">
                        {typeof details.currentValue === "number" && typeof details.limitValue === "number" ? (
                            <>
                                You&apos;re using {details.currentValue} of {details.limitValue} on the{" "}
                                {details.currentTier === "free" ? "Free" : details.currentTier === "plus" ? "Plus" : "Pro"} tier.{" "}
                            </>
                        ) : null}
                        {copy.reason}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Maybe later
                    </Button>
                    <Button asChild>
                        <Link href={pricingHref}>Upgrade to {planLabel}</Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
