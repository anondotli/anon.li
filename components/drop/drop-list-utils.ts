import { Folder, type LucideIcon } from "lucide-react";

import { getFileIcon } from "@/lib/file-icons";

export function getDropFileIcon(mimeType: string, filename?: string): LucideIcon {
  if (mimeType === "application/folder") {
    return Folder;
  }

  return getFileIcon(filename, mimeType);
}

interface DropExpiryState {
  downloads: number;
  expiresAt: string | null;
  maxDownloads: number | null;
}

export function hasDropReachedDownloadLimit(downloads: number, maxDownloads: number | null) {
  return maxDownloads !== null && downloads >= maxDownloads;
}

export function isDropExpired({ downloads, expiresAt, maxDownloads }: DropExpiryState) {
  if (hasDropReachedDownloadLimit(downloads, maxDownloads)) {
    return true;
  }

  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= Date.now();
}

export function formatDropExpiry(
  expiresAt: string | null,
  downloads = 0,
  maxDownloads: number | null = null
) {
  if (hasDropReachedDownloadLimit(downloads, maxDownloads)) {
    return "Limit reached";
  }

  if (!expiresAt) return "Never";

  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs <= 0) {
    const gracePeriodMs = 24 * 60 * 60 * 1000;
    const timeSinceExpiry = now.getTime() - expiry.getTime();
    const remainingGrace = gracePeriodMs - timeSinceExpiry;

    if (remainingGrace > 0) {
      const hoursLeft = Math.ceil(remainingGrace / (1000 * 60 * 60));
      return hoursLeft <= 1 ? "Deleting soon..." : `Deleting in ${hoursLeft}h`;
    }

    return "Expired";
  }

  if (diffDays === 1) return "1 day";

  return `${diffDays} days`;
}
