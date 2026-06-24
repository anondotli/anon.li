"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Copy, Check, Trash2, Mail, ShieldCheck, Clock, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { buildRecipientShareUrl } from "@/lib/drop-share-url";
import {
  listDropRecipientsAction,
  addDropRecipientsAction,
  revokeDropRecipientAction,
  listDropAccessEventsAction,
} from "@/actions/drop";
import type { RecipientListItem, AccessEventItem } from "@/lib/services/drop";

export interface ManagedDrop {
  id: string;
  customKey: boolean;
  keyString: string | null;
  restrictToRecipients: boolean;
}

interface RecipientsDialogProps {
  drop: ManagedDrop | null;
  origin: string;
  /** recipientControls entitlement (Plus+). */
  canManage: boolean;
  /** accessLogs entitlement (Pro+). */
  canViewLogs: boolean;
  onClose: () => void;
  onChange?: () => void;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RecipientsDialog({ drop, origin, canManage, canViewLogs, onClose, onChange }: RecipientsDialogProps) {
  // The dialog is keyed by drop id in the parent, so these initializers run
  // fresh each time it opens for a different drop — no reset effect needed.
  const [recipients, setRecipients] = useState<RecipientListItem[]>([]);
  const [emails, setEmails] = useState("");
  const [restrict, setRestrict] = useState(drop?.restrictToRecipients ?? false);
  const [notify, setNotify] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newLinks, setNewLinks] = useState<{ email: string; url: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const [events, setEvents] = useState<AccessEventItem[] | null>(null);
  const [logLocked, setLogLocked] = useState(false);

  // The key is required to assemble random-key recipient links; password drops
  // (customKey) don't put a key in the URL, so they're fine without it.
  const keyReady = drop ? drop.customKey || !!drop.keyString : false;

  const loadRecipients = useCallback(async (dropId: string) => {
    const res = await listDropRecipientsAction(dropId);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setRecipients(res.data?.recipients ?? []);
  }, []);

  useEffect(() => {
    if (!drop) return;
    const id = drop.id;
    // Defer the async load (which setStates) out of the effect body, matching
    // the pattern used elsewhere in DropList to satisfy react-hooks lint.
    const timer = window.setTimeout(() => void loadRecipients(id), 0);
    return () => window.clearTimeout(timer);
  }, [drop, loadRecipients]);

  if (!drop) return null;
  const activeDrop = drop;

  const handleToggleRestrict = async (value: boolean) => {
    setRestrict(value);
    const res = await addDropRecipientsAction({ dropId: activeDrop.id, recipients: [], restrict: value });
    if (res.error) {
      setRestrict(!value);
      toast.error(res.code === "UPGRADE_REQUIRED" ? "Upgrade to Plus to control recipients." : res.error);
      return;
    }
    toast.success(value ? "Only named recipients can download" : "Anyone with the link can download");
    onChange?.();
  };

  const handleAdd = async () => {
    const parsed = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    const valid = parsed.filter((e) => EMAIL_RE.test(e));
    const invalid = parsed.filter((e) => !EMAIL_RE.test(e));
    if (valid.length === 0) {
      toast.error("Enter at least one valid email address");
      return;
    }
    if (invalid.length > 0) {
      toast.error(`Skipping invalid: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`);
    }
    if (notify && !activeDrop.customKey && !activeDrop.keyString) {
      toast.error("Email notification needs the decryption key; copy links instead.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await addDropRecipientsAction({
        dropId: activeDrop.id,
        recipients: valid.map((email) => ({ email })),
        notify,
      });
      if (res.error) {
        toast.error(res.code === "UPGRADE_REQUIRED" ? "Adding named recipients requires Plus." : res.error);
        return;
      }
      const created = res.recipients ?? [];
      setNewLinks(
        created.map((r) => ({
          email: r.email,
          url: buildRecipientShareUrl(origin, activeDrop.id, r.token, activeDrop.keyString, activeDrop.customKey),
        })),
      );
      setEmails("");
      toast.success(`Added ${created.length} recipient${created.length === 1 ? "" : "s"}`);
      await loadRecipients(activeDrop.id);
      onChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (recipientId: string) => {
    const res = await revokeDropRecipientAction(activeDrop.id, recipientId);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Recipient access revoked");
    await loadRecipients(activeDrop.id);
    onChange?.();
  };

  const copy = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const loadEvents = async () => {
    const res = await listDropAccessEventsAction(activeDrop.id);
    if (res.error) {
      // Pro-gated: show an upsell panel rather than an error toast.
      if (res.code === "UPGRADE_REQUIRED") {
        setLogLocked(true);
        return;
      }
      toast.error(res.error);
      return;
    }
    setEvents(res.data?.events ?? []);
  };

  return (
    <Dialog open={!!drop} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Recipients & access
          </DialogTitle>
          <DialogDescription>
            Give specific people their own revocable link, and see who has opened this drop.
            anon.li never sees the decryption key.
          </DialogDescription>
        </DialogHeader>

        {!canManage ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Named recipients, per-person revoke, and access logs are available on{" "}
            <span className="font-medium text-foreground">Plus</span> and{" "}
            <span className="font-medium text-foreground">Pro</span> plans.
          </div>
        ) : (
          <Tabs defaultValue="recipients" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="recipients">Recipients</TabsTrigger>
              <TabsTrigger value="log" onClick={() => events === null && !logLocked && void loadEvents()}>
                Access log
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recipients" className="space-y-4 pt-2">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <ShieldCheck className="h-3.5 w-3.5" /> Restrict to named recipients
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When on, the bare link won&apos;t work — only the links below.
                  </p>
                </div>
                <Switch checked={restrict} onCheckedChange={handleToggleRestrict} aria-label="Restrict to named recipients" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recipient-emails" className="text-sm">Add people (emails)</Label>
                <Textarea
                  id="recipient-emails"
                  placeholder="alice@example.com, bob@example.com"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  rows={2}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={notify} onCheckedChange={setNotify} aria-label="Email a link to each recipient" />
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> Email each a keyless link</span>
                  </label>
                  <Button size="sm" onClick={handleAdd} disabled={submitting || !keyReady}>
                    {submitting ? "Adding…" : "Add"}
                  </Button>
                </div>
                {!keyReady && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Decryption key unavailable — unlock your vault to add recipients.
                  </p>
                )}
              </div>

              {newLinks.length > 0 && (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-medium">Share these links (each is unique &amp; revocable):</p>
                  {newLinks.map((l) => (
                    <div key={l.url} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={l.email}>{l.email}</span>
                      <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{l.url}</code>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(l.url, l.url)} aria-label="Copy link">
                        {copied === l.url ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <div className="space-y-1.5">
                {recipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recipients yet.</p>
                ) : (
                  recipients.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{r.label ? `${r.label} · ${r.email}` : r.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.downloads} download{r.downloads === 1 ? "" : "s"}
                          {r.maxDownloads ? ` / ${r.maxDownloads}` : ""}
                          {r.lastAccessAt ? ` · last ${new Date(r.lastAccessAt).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      {r.revokedAt ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Revoked</Badge>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleRevoke(r.id)} aria-label="Revoke">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="log" className="pt-2">
              {logLocked || !canViewLogs ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  The per-download access log (who opened this drop, and when) is a{" "}
                  <span className="font-medium text-foreground">Pro</span> feature.
                </div>
              ) : events === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No downloads recorded yet.</p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span className="truncate">{e.recipientEmail ?? "Anonymous link"}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">{e.eventType === "zip_all" ? "all files" : "download"}</Badge>
                        <Clock className="h-3 w-3" />
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
