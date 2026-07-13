"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Key, Clock, Download, EyeOff, Bell,
  Settings2, ChevronDown, FileIcon, ArrowRight, MessageSquare
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DROP_PASSWORD_MIN_LENGTH } from "@/lib/constants";

export interface DropConfig {
  title: string;
  message: string;
  protectionMode: "key" | "password";
  password: string;
  expiryDays: number | string | null;
  maxDownloads: string;
  hideBranding: boolean;
  notifyOnDownload: boolean;
}

interface DropSettingsProps {
  config: DropConfig;
  onUpdate: (updates: Partial<DropConfig>) => void;
  showTitleInput: boolean;
  maxExpiry: number; // -1 for unlimited
  features: {
    noBranding: boolean;
    downloadNotifications: boolean;
    customKey: boolean;
  };
}

export function DropSettings({
  config,
  onUpdate,
  showTitleInput,
  maxExpiry,
  features,
}: DropSettingsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const expiryLabel = config.expiryDays === 0
    ? "No auto-delete"
    : `Deletes after ${config.expiryDays || maxExpiry} day${Number(config.expiryDays || maxExpiry) === 1 ? "" : "s"}`;
  const downloadLabel = config.maxDownloads
    ? `${config.maxDownloads} download${config.maxDownloads === "1" ? "" : "s"} maximum`
    : "No download limit";

  return (
    <div className="grid gap-6 animate-in slide-in-from-bottom-2 duration-300 delay-100">
      {/* Collection Name - Only for multiple files */}
      {showTitleInput && (
        <div className="space-y-3">
          <Label htmlFor="drop-title" className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
            <FileIcon className="w-3 h-3" /> Collection Name
          </Label>
          <Input
            id="drop-title"
            type="text"
            placeholder="Give this collection a name (optional)"
            value={config.title}
            onChange={e => onUpdate({ title: e.target.value })}
            maxLength={200}
            className="rounded-xl bg-secondary/30 border-0 h-11"
          />
        </div>
      )}

      <div className="space-y-3">
        <Label htmlFor="drop-message" className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
          <MessageSquare className="w-3 h-3" /> Message
          <span className="normal-case tracking-normal font-normal">(optional)</span>
        </Label>
        <Textarea
          id="drop-message"
          placeholder="Add context for the recipient"
          value={config.message}
          onChange={event => onUpdate({ message: event.target.value })}
          maxLength={1000}
          rows={3}
          className="min-h-20 resize-y rounded-xl bg-secondary/30 border-0"
        />
        <p className="text-xs text-muted-foreground">
          Encrypted with your files · {config.message.length}/1000
        </p>
      </div>

      {/* Advanced Settings Toggle */}
      <div>
        <p className="mb-2 text-center text-xs text-muted-foreground" role="status" aria-live="polite">
          {config.protectionMode === "password" ? "Password required" : "Key included in link"}
          {" · "}{expiryLabel}{" · "}{downloadLabel}
        </p>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
          aria-expanded={showAdvanced}
          aria-controls="drop-advanced-options"
        >
          <Settings2 className="w-4 h-4" />
          <span>{showAdvanced ? "Hide" : "Show"} options</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        {showAdvanced && (
          <div id="drop-advanced-options" className="space-y-4 pt-4 mt-2 border-t border-border/50 animate-in slide-in-from-top-2 duration-200">
           <TooltipProvider>
            {/* Encryption Key */}
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
                <Key className="w-3 h-3" /> Encryption key
              </Label>
              <Tabs
                value={config.protectionMode}
                aria-label="Encryption key protection"
                onValueChange={v => {
                  if (v === "password" && !features.customKey) return;
                  onUpdate({ protectionMode: v as "key" | "password" });
                }}
              >
                <TabsList className="grid grid-cols-2 w-full h-10 bg-secondary/50 rounded-xl p-1">
                  <TabsTrigger value="key" className="rounded-lg text-xs">Random (Recommended)</TabsTrigger>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        value="password"
                        className="rounded-lg text-xs"
                        disabled={!features.customKey}
                      >
                        Custom
                        {!features.customKey && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Plus</span>
                        )}
                      </TabsTrigger>
                    </TooltipTrigger>
                    {!features.customKey && (
                      <TooltipContent className="max-w-[200px]">
                        <p className="font-medium mb-1">Plus feature</p>
                        <p className="text-xs text-muted-foreground">Protect your drop with a custom password</p>
                        <Link href="/pricing" className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline">
                          Upgrade <ArrowRight className="w-3 h-3" />
                        </Link>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TabsList>
              </Tabs>
              {config.protectionMode === "password" && (
                <div className="space-y-2">
                  <Input
                    id="drop-password"
                    type="password"
                    placeholder={`Set a password (min ${DROP_PASSWORD_MIN_LENGTH} characters)`}
                    value={config.password}
                    onChange={e => onUpdate({ password: e.target.value })}
                    className={`rounded-xl bg-secondary/30 border-0 h-11 ${
                      config.password.length > 0 && config.password.length < DROP_PASSWORD_MIN_LENGTH ? "ring-1 ring-amber-500/50" : ""
                    }`}
                    autoComplete="new-password"
                    aria-describedby="drop-password-help"
                  />
                  {config.password.length > 0 && config.password.length < DROP_PASSWORD_MIN_LENGTH && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Password must be at least {DROP_PASSWORD_MIN_LENGTH} characters ({DROP_PASSWORD_MIN_LENGTH - config.password.length} more needed)
                    </p>
                  )}
                </div>
              )}
              <p id="drop-password-help" className="text-xs text-muted-foreground">
                {config.protectionMode === "key"
                  ? "Your files are encrypted. The key is included in the share link."
                  : config.password.length >= DROP_PASSWORD_MIN_LENGTH
                    ? "Recipients will need this password to decrypt your files."
                    : "Set a password to protect your files."
                }
              </p>
            </div>

            {/* Expiry & Downloads - Compact grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="drop-expiry-days" className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Auto-delete after
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="drop-expiry-days"
                    type="number"
                    min="1"
                    max={maxExpiry !== -1 ? maxExpiry : undefined}
                    placeholder={maxExpiry === -1 ? "∞" : String(maxExpiry)}
                    value={config.expiryDays === 0 || config.expiryDays === null ? "" : config.expiryDays}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "") {
                        onUpdate({ expiryDays: "" });
                      } else {
                        const num = parseInt(val, 10);
                        // Clamp to maxExpiry if not unlimited
                        if (maxExpiry !== -1 && num > maxExpiry) {
                          onUpdate({ expiryDays: maxExpiry });
                        } else if (num >= 1) {
                          onUpdate({ expiryDays: num });
                        }
                      }
                    }}
                    disabled={maxExpiry === -1 && config.expiryDays === 0}
                    className="flex-1 rounded-xl bg-secondary/30 border-0 h-10"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">days</span>
                </div>
                {maxExpiry === -1 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={config.expiryDays === 0}
                      onCheckedChange={c => onUpdate({ expiryDays: c ? 0 : 7 })}
                      className="scale-90"
                      aria-label="Disable automatic deletion"
                    />
                    <span className="text-xs text-muted-foreground">No auto-delete</span>
                  </label>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="drop-max-downloads" className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
                  <Download className="w-3 h-3" /> Max downloads
                </Label>
                <Input
                  id="drop-max-downloads"
                  type="number"
                  min="1"
                  placeholder="No limit"
                  value={config.maxDownloads}
                  onChange={e => onUpdate({ maxDownloads: e.target.value })}
                  className="rounded-xl bg-secondary/30 border-0 h-10"
                />
              </div>
            </div>

            {/* Toggle Options */}
              <div className="space-y-3">
                {/* Hide branding */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 transition-colors hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Hide branding</span>
                    {!features.noBranding && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Pro</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          <p className="font-medium mb-1">Pro feature</p>
                          <p className="text-xs text-muted-foreground">Remove anon.li branding from download pages</p>
                          <Link href="/pricing" className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline">
                            Upgrade <ArrowRight className="w-3 h-3" />
                          </Link>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <Switch
                    checked={config.hideBranding}
                    onCheckedChange={v => onUpdate({ hideBranding: v })}
                    disabled={!features.noBranding}
                    aria-label="Hide anon.li branding"
                  />
                </div>

                {/* Download notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 transition-colors hover:bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Notify on download</span>
                    {!features.downloadNotifications && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Pro</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[200px]">
                          <p className="font-medium mb-1">Pro feature</p>
                          <p className="text-xs text-muted-foreground">Get notified when someone downloads your files</p>
                          <Link href="/pricing" className="text-xs text-primary inline-flex items-center gap-1 mt-1 hover:underline">
                            Upgrade <ArrowRight className="w-3 h-3" />
                          </Link>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <Switch
                    checked={config.notifyOnDownload}
                    onCheckedChange={v => onUpdate({ notifyOnDownload: v })}
                    disabled={!features.downloadNotifications}
                    aria-label="Notify me when this drop is downloaded"
                  />
                </div>
              </div>
           </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
}
