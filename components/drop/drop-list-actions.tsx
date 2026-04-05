"use client";

import { Check, Copy, Download, Link2Off, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QRCodeShareWithKey } from "@/components/drop/qr-code-share-with-key";

interface DropListActionsProps {
  copied: boolean;
  customKey: boolean;
  disabled: boolean;
  dropId: string;
  expired: boolean;
  isPending: boolean;
  takenDown: boolean;
  title: string;
  onCopyLink: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onToggleLink: () => void;
}

export function DropListActions({
  copied,
  customKey,
  disabled,
  dropId,
  expired,
  isPending,
  takenDown,
  title,
  onCopyLink,
  onDelete,
  onDownload,
  onToggleLink,
}: DropListActionsProps) {
  const dropUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/d/${dropId}`;
  const unavailable = disabled || expired || takenDown;
  const unavailableLabel = takenDown ? "Drop unavailable" : expired ? "Drop expired" : disabled ? "Link disabled" : null;

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
              disabled={unavailable}
              aria-label="Copy Link"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{unavailableLabel ?? "Copy Link"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <QRCodeShareWithKey disabled={unavailable} dropId={dropId} url={dropUrl} title={title} customKey={customKey} />
            </div>
          </TooltipTrigger>
          <TooltipContent>{unavailableLabel ?? "QR Code"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onDownload}
              disabled={unavailable}
              aria-label="Open / Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{unavailableLabel ?? "Open / Download"}</TooltipContent>
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
