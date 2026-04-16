"use client";

import { Check, Copy, Download, Link2Off, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QRCodeShare } from "@/components/drop/qr-code-share";

interface DropListActionsProps {
  copied: boolean;
  disabled: boolean;
  dropUrl: string;
  encryptionKey?: string | null;
  expired: boolean;
  isPending: boolean;
  linkUnavailableReason?: string | null;
  takenDown: boolean;
  title: string;
  onCopyLink: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onToggleLink: () => void;
}

export function DropListActions({
  copied,
  disabled,
  dropUrl,
  encryptionKey = null,
  expired,
  isPending,
  linkUnavailableReason = null,
  takenDown,
  title,
  onCopyLink,
  onDelete,
  onDownload,
  onToggleLink,
}: DropListActionsProps) {
  const unavailableLabel = takenDown ? "Drop unavailable" : expired ? "Drop expired" : disabled ? "Link disabled" : null;
  const linkActionLabel = unavailableLabel ?? linkUnavailableReason;

  return (
    <div className="flex items-center justify-end gap-1">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onCopyLink}
              disabled={!!linkActionLabel}
              aria-label="Copy Link"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{linkActionLabel ?? "Copy Link"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <QRCodeShare disabled={!!linkActionLabel} url={dropUrl} title={title} encryptionKey={encryptionKey} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{linkActionLabel ?? "QR Code"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDownload}
              disabled={!!linkActionLabel}
              aria-label="Open / Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{linkActionLabel ?? "Open / Download"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleLink}
              disabled={isPending || takenDown || expired}
              aria-label={disabled ? "Enable Link" : "Disable Link"}
            >
              <Link2Off className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{takenDown ? "Drop unavailable" : expired ? "Drop expired" : disabled ? "Enable Link" : "Disable Link"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-destructive">
            Delete Drop
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
