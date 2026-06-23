"use client";

import { useClipboard } from "@/hooks/use-clipboard";
import Link from "next/link";
import { Check, Copy, Mail, Key, Plus, Clock, Download, Lock, Infinity, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/format";
import { generateMailtoLink, type DropShareOptions } from "@/lib/types/drop-types";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";

interface SuccessViewProps {
  shareUrl: string;
  password?: string;
  fileCount: number;
  totalSize: number;
  expiresAt?: Date;
  maxDownloads?: number;
  onReset: () => void;
  /** Guests upload anonymously (100MB cap, no dashboard) — show an account CTA. */
  isGuest?: boolean;
}

export function SuccessView({
  shareUrl, password, fileCount, totalSize, expiresAt, maxDownloads, onReset, isGuest = false
}: SuccessViewProps) {
  const { copied, copy } = useClipboard();

  const copyLink = async () => {
    if (await copy(shareUrl)) {
      analytics.dropShareLinkCopied();
      toast.success("Link copied!");
    }
  };

  const mailtoOptions: DropShareOptions = { shareUrl, fileCount, totalSize };
  const mailto = generateMailtoLink(mailtoOptions);

  const expiry = expiresAt ? formatExpiry(expiresAt) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
          <Check className="w-8 h-8 text-green-500" />
        </div>
        <p className="font-serif text-xl mb-1">Drop ready</p>
        <p className="text-sm text-muted-foreground">{fileCount} file{fileCount > 1 ? 's' : ''} • {formatBytes(totalSize)}</p>
      </div>

      {/* Transfer details */}
      <div className="grid grid-cols-3 gap-2 text-sm">
        {password ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/5 border border-green-500/10">
            <Lock className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-green-700 dark:text-green-300"><span className="hidden sm:inline">Password protected</span><span className="sm:hidden">Password</span></span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border/50">
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground"><span className="hidden sm:inline">Link-only access</span><span className="sm:hidden">Link</span></span>
          </div>
        )}
        {expiry && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border/50">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground"><span className="hidden sm:inline">{expiry.full}</span><span className="sm:hidden">{expiry.short}</span></span>
          </div>
        )}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary/50 border border-border/50">
          <Download className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            {maxDownloads ? (
              <>{maxDownloads} download{maxDownloads > 1 ? 's' : ''}</>
            ) : (
              <span className="inline-flex items-center gap-1"><Infinity className="w-4 h-4" /> downloads</span>
            )}
          </span>
        </div>
      </div>

      {/* ph-no-capture: the share URL fragment is the Drop key — keep it out of analytics autocapture. */}
      <div className="flex gap-2 ph-no-capture">
        <Input
          value={shareUrl}
          readOnly
          className="font-mono text-xs rounded-xl bg-secondary/30 border-0 h-11"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy link"
          onClick={copyLink}
          className="h-11 w-11 rounded-xl shrink-0 border-border/50 hover:border-primary/30 hover:bg-primary/5"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" className="rounded-full h-11 ph-no-capture" asChild>
          <a href={mailto}><Mail className="w-4 h-4 mr-2" /> Email link</a>
        </Button>
        <Button variant="outline" className="rounded-full h-11 border-border/50" onClick={onReset}>
          <Plus className="w-4 h-4 mr-2" /> New drop
        </Button>
      </div>

      {password && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <Key className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Remember to share your password separately
          </p>
        </div>
      )}

      {/* Guests can't manage drops or send large files — nudge to a free account. */}
      {isGuest && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">Want to do more with anon.li?</p>
              <p className="text-sm text-muted-foreground">
                Create a free account to send files up to 5&nbsp;GB, manage and delete your drops, and see when they&apos;re downloaded.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm" className="rounded-full">
                  <Link href="/register?from=drop">Create free account</Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="rounded-full">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* What recipient will see */}
      <details className="group">
        <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
          <span className="group-open:hidden">What will the recipient see?</span>
          <span className="hidden group-open:inline">What the recipient sees</span>
        </summary>
        <div className="mt-3 p-4 rounded-xl bg-secondary/30 border border-border/50 text-sm text-muted-foreground space-y-2">
          <p>The recipient will see a download page with:</p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>{fileCount} file{fileCount > 1 ? 's' : ''} ({formatBytes(totalSize)}) ready to download</li>
            {password && <li>A password prompt before they can access the files</li>}
            {expiry && <li>A countdown showing when the link expires</li>}
            {maxDownloads && <li>Remaining downloads out of {maxDownloads}</li>}
          </ul>
          <p className="text-xs text-muted-foreground/70 mt-2">
            Files are decrypted in the recipient&apos;s browser. We never see the content.
          </p>
        </div>
      </details>
    </div>
  );
}

function formatExpiry(expiresAt: Date): { full: string; short: string } {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  if (diff <= 0) return { full: "Expired", short: "Expired" };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) {
    const time = `${days}d ${hours}h`;
    return { full: `Expires in ${time}`, short: time };
  }
  if (hours > 0) return { full: `Expires in ${hours}h`, short: `${hours}h` };
  const minutes = Math.floor(diff / (1000 * 60));
  return { full: `Expires in ${minutes}m`, short: `${minutes}m` };
}
