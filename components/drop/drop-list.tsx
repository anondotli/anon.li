"use client";

import { useState, useEffect, Fragment, useTransition, useCallback } from "react";

import { toast } from "sonner";
import {
  Clock,
  Lock,
  Link2Off,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { cn, formatBytes } from "@/lib/utils";
import { cryptoService } from "@/lib/crypto.client";
import { buildDropShareUrl } from "@/lib/drop-share-url";
import { fetchWrappedDropKeys } from "@/lib/vault/drop-keys-client";
import { exportKeyBase64Url } from "@/lib/vault/crypto";
import { useVault } from "@/components/vault/vault-provider";
import { toggleDropAction, deleteDropAction } from "@/actions/drop";
import type { DropData, StorageData } from "@/actions/drop";
import { DropListActions } from "@/components/drop/drop-list-actions";
import { formatDropExpiry, getDropFileIcon, isDropExpired } from "@/components/drop/drop-list-utils";

interface DropFileItem {
  id: string;
  encryptedName: string;
  size: string;
  mimeType: string;
  iv: string;
  decryptedName?: string;
}

interface DropItem extends Omit<DropData, 'files'> {
  files: DropFileItem[];
  decryptedTitle?: string;
  keyString: string | null;
  keyUnavailable: boolean;
}

interface ResolvedDropKeyMaterial {
  key: CryptoKey | null;
  keyString: string | null;
}

interface DropListProps {
  initialDrops: DropData[];
  storage: StorageData;
  onDropsChange?: () => void;
  isRefreshing?: boolean;
}

export function DropList({ initialDrops, storage, onDropsChange }: DropListProps) {
  const { unwrapDropKey } = useVault();
  const [drops, setDrops] = useState<DropItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteItem, setDeleteItem] = useState<DropItem | null>(null);
  const [expandedDrops, setExpandedDrops] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const resolveDropKeys = useCallback(async (dropsToDecrypt: DropData[]) => {
    const wrappedKeys = await fetchWrappedDropKeys();
    const wrappedKeyMap = new Map(wrappedKeys.map((wrappedKey) => [wrappedKey.dropId, wrappedKey]));

    const resolvedKeys = await Promise.all(
      dropsToDecrypt.map(async (drop) => {
        const wrappedKey = wrappedKeyMap.get(drop.id);
        if (!wrappedKey) {
          return [drop.id, { key: null, keyString: null }] as const;
        }

        try {
          const key = await unwrapDropKey(wrappedKey.wrappedKey);
          const keyString = await exportKeyBase64Url(key);
          return [drop.id, { key, keyString }] as const;
        } catch {
          return [drop.id, { key: null, keyString: null }] as const;
        }
      })
    );

    return new Map<string, ResolvedDropKeyMaterial>(resolvedKeys);
  }, [unwrapDropKey]);

  const decryptDrops = useCallback(async (dropsToDecrypt: DropData[]) => {
    setLoading(true);
    try {
      const resolvedKeys = await resolveDropKeys(dropsToDecrypt);

      const processedDrops = await Promise.all(
        dropsToDecrypt.map(async (drop) => {
          const { key, keyString } = resolvedKeys.get(drop.id) ?? { key: null, keyString: null };

          let decryptedTitle: string | undefined;

          if (key && drop.encryptedTitle && drop.iv) {
            try {
              const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(drop.iv));
              decryptedTitle = await cryptoService.decryptFilename(drop.encryptedTitle, key, iv);
            } catch {
              // Decryption failed
            }
          }

          // Also decrypt file names
          const processedFiles = await Promise.all(
            drop.files.map(async (file) => {
              let decryptedName: string | undefined;
              if (key && file.encryptedName && file.iv) {
                try {
                  const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(file.iv));
                  decryptedName = await cryptoService.decryptFilename(file.encryptedName, key, iv);
                } catch {
                  // Decryption failed
                }
              }
              return { ...file, decryptedName };
            })
          );

          return {
            ...drop,
            decryptedTitle,
            files: processedFiles,
            keyString,
            keyUnavailable: !drop.customKey && !keyString,
          };
        })
      );

      setDrops(processedDrops);
    } catch {
      toast.error("Failed to load some drop details");
      setDrops(dropsToDecrypt.map((drop) => ({
        ...drop,
        files: drop.files.map((file) => ({ ...file })),
        keyString: null,
        keyUnavailable: !drop.customKey,
      })));
    } finally {
      setLoading(false);
    }
  }, [resolveDropKeys]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void decryptDrops(initialDrops);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [initialDrops, decryptDrops]);

  const handleDelete = async (drop: DropItem) => {
    try {
      const result = await deleteDropAction(drop.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Drop deleted");
      setDeleteItem(null);
      onDropsChange?.();
    } catch {
      toast.error("Failed to delete drop");
    }
  };

  const handleDownload = async (drop: DropItem) => {
    if (!drop.customKey && !drop.keyString) {
      toast.error("Encryption key unavailable");
      return;
    }

    const url = buildDropShareUrl(window.location.origin, drop.id, drop.keyString, drop.customKey);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleToggleLink = (drop: DropItem) => {
    startTransition(async () => {
      const result = await toggleDropAction(drop.id);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(result.data?.disabled ? "Link disabled" : "Link enabled");
        onDropsChange?.();
      }
    });
  };

  const handleCopyLink = async (drop: DropItem) => {
    if (!drop.customKey && !drop.keyString) {
      toast.error("Encryption key unavailable");
      return;
    }

    const shareUrl = buildDropShareUrl(window.location.origin, drop.id, drop.keyString, drop.customKey);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(drop.id);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedDrops);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedDrops(newSet);
  };

  const storageUsed = parseInt(storage.used);
  const storageLimit = parseInt(storage.limit);
  const storagePercentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Storage meter */}
      <div className="p-4 bg-muted/50 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span>Storage Used</span>
          <span>
            {formatBytes(storageUsed)} / {formatBytes(storageLimit)}
          </span>
        </div>
        <Progress value={storagePercentage} />
        {storagePercentage > 80 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            You&apos;re running low on storage. Consider upgrading your plan.
          </p>
        )}
      </div>

      {/* Drop list */}
      {drops.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No drops yet</p>
          <p className="text-sm">Create your first drop above</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drops.map((drop) => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const hasMultipleFiles = drop.files.length > 1;
                const isExpanded = expandedDrops.has(drop.id);
                const singleFile = drop.files.length === 1 ? drop.files[0] : null;
                const totalSize = drop.files.reduce((sum, f) => sum + parseInt(f.size), 0);
                const expired = isDropExpired({
                  downloads: drop.downloads,
                  expiresAt: drop.expiresAt,
                  maxDownloads: drop.maxDownloads,
                });
                const unavailable = drop.disabled || drop.takenDown || expired;

                const MimeIcon = singleFile
                  ? getDropFileIcon(singleFile.mimeType, singleFile.decryptedName)
                  : getDropFileIcon("application/folder");

                const displayName = drop.decryptedTitle
                  || singleFile?.decryptedName
                  || (hasMultipleFiles ? `${drop.files.length} files` : `Drop ${drop.id.slice(0, 8)}...`);
                const linkUnavailableReason = drop.keyUnavailable ? "Key unavailable" : null;
                const dropUrl = buildDropShareUrl(origin, drop.id, null, drop.customKey);
                const encryptionKey = drop.customKey ? null : drop.keyString;

                return (
                  <Fragment key={drop.id}>
                    <TableRow
                      className={cn(
                        hasMultipleFiles && "cursor-pointer hover:bg-muted/50",
                        unavailable && "opacity-60"
                      )}
                      onClick={hasMultipleFiles ? () => toggleExpanded(drop.id) : undefined}
                    >
                      <TableCell>
                        {hasMultipleFiles && (
                          <div className="flex items-center justify-center">
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            }
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <MimeIcon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium truncate max-w-[200px]" title={displayName}>
                              {displayName}
                            </span>
                            <div className="flex gap-1.5">
                              {drop.customKey && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  <Lock className="w-2.5 h-2.5 mr-1" />
                                  Protected
                                </Badge>
                              )}
                              {drop.disabled && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600">
                                  <Link2Off className="w-2.5 h-2.5 mr-1" />
                                  Disabled
                                </Badge>
                              )}
                              {drop.takenDown && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  Taken Down
                                </Badge>
                              )}
                              {expired && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <Clock className="w-2.5 h-2.5 mr-1" />
                                  Expired
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatBytes(totalSize)}</TableCell>
                      <TableCell>
                        {drop.downloads}
                        {drop.maxDownloads && ` / ${drop.maxDownloads}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">{formatDropExpiry(drop.expiresAt, drop.downloads, drop.maxDownloads)}</span>
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropListActions
                          copied={copiedId === drop.id}
                          disabled={drop.disabled}
                          dropUrl={dropUrl}
                          encryptionKey={encryptionKey}
                          expired={expired}
                          isPending={isPending}
                          linkUnavailableReason={linkUnavailableReason}
                          takenDown={drop.takenDown}
                          title={displayName}
                          onCopyLink={() => handleCopyLink(drop)}
                          onDelete={() => setDeleteItem(drop)}
                          onDownload={() => handleDownload(drop)}
                          onToggleLink={() => handleToggleLink(drop)}
                        />
                      </TableCell>
                    </TableRow>

                    {/* Expanded files */}
                    {hasMultipleFiles && isExpanded && drop.files.map((file) => {
                      const FileIcon = getDropFileIcon(file.mimeType, file.decryptedName);
                      return (
                        <TableRow key={file.id} className="bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3 pl-4">
                              <div className="p-1.5 rounded-md bg-muted">
                                <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
                              </div>
                              <span className="text-sm truncate max-w-[180px]">
                                {file.decryptedName || `${file.id.slice(0, 8)}...`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatBytes(parseInt(file.size))}
                          </TableCell>
                          <TableCell colSpan={3}></TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this drop?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the drop and all its files.
              Anyone with the link will no longer be able to access them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && handleDelete(deleteItem)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
