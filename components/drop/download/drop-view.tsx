"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Download, Clock, ChevronDown, ChevronUp,
  FileArchive, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getFileIcon } from "@/lib/file-icons";
import { type DecryptedDrop } from "@/hooks/use-drop-download";
import { FilePreview } from "../file-preview";
import { PageWrapper } from "./page-wrapper";

interface DropDownloadViewProps {
  drop: DecryptedDrop;
  keyString: string;
  recipientToken: string | null;
  downloading: boolean;
  downloadProgress: number;
  currentFile: string | null;
  downloadError: string | null;
  clearDownloadError: () => void;
  downloadFile: (fileId: string) => void;
  downloadAll: () => void;
  canDownloadAsZip: boolean;
  formatBytes: (size: number) => string;
}

export function DropDownloadView({
  drop,
  keyString,
  recipientToken,
  downloading,
  downloadProgress,
  currentFile,
  downloadError,
  clearDownloadError,
  downloadFile,
  downloadAll,
  canDownloadAsZip,
  formatBytes,
}: DropDownloadViewProps) {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const isSingleFile = drop.files.length === 1;
  const firstFile = drop.files[0];
  const totalSize = drop.files.reduce((sum, f) => sum + f.size, 0);

  const displayFiles = showAllFiles ? drop.files : drop.files.slice(0, 3);
  const hasMoreFiles = drop.files.length > 3;

  const expiryInfo = useMemo(() => {
    if (!drop.expiresAt) return null;
    const now = new Date();
    const totalMs = drop.expiresAt.getTime() - now.getTime();

    if (totalMs <= 0) return "Expired";

    const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return `${parts.join(" ")} left`;
  }, [drop.expiresAt]);

  return (
    <PageWrapper showBranding={!drop.hideBranding}>
      <div className="max-w-md w-full animate-in zoom-in-95 duration-500">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 flex justify-center">
            {isSingleFile && firstFile ? (
              <FilePreview
                dropId={drop.id}
                fileId={firstFile.id}
                filename={firstFile.decryptedName}
                mimeType={firstFile.mimeType}
                keyString={keyString}
                ivString={firstFile.iv}
                size={firstFile.size}
                encryptedSize={firstFile.encryptedSize}
                chunkSize={firstFile.chunkSize}
                chunkCount={firstFile.chunkCount}
                recipientToken={recipientToken}
                // A preview fetch exposes the full plaintext and therefore must
                // consume a download. Hide it on globally capped or recipient-
                // token links so "preview" cannot unexpectedly spend an allowance.
                disabled={drop.maxDownloads !== null || recipientToken !== null}
              >
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg shadow-primary/5 transition-transform hover:scale-105 active:scale-95 cursor-pointer">
                  {(() => {
                    const Icon = getFileIcon(firstFile.decryptedName, firstFile.mimeType);
                    return <Icon className="w-10 h-10 text-primary" />;
                  })()}
                </div>
              </FilePreview>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-lg shadow-primary/5">
                <FileArchive className="w-10 h-10 text-primary" />
              </div>
            )}
          </div>

          <h1 className="text-2xl font-serif font-medium mb-1 break-all px-4">
            {drop.title || (isSingleFile && firstFile ? firstFile.decryptedName : `${drop.files.length} Files`)}
          </h1>

          {drop.message && (
            <p className="text-muted-foreground mt-2 px-4">{drop.message}</p>
          )}

          <p className="text-muted-foreground mt-1">
            {formatBytes(totalSize)}
            {!isSingleFile && ` · ${drop.files.length} files`}
          </p>
        </div>

        {/* Main card */}
        <div className="bg-card border rounded-2xl p-6 space-y-6 shadow-sm">
          {downloadError && !downloading && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Download failed</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {downloadError} You can try the download again.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={clearDownloadError}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Progress */}
          {downloading ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[200px]">
                  {currentFile || "Decrypting..."}
                </span>
                <span className="font-medium">{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {downloadProgress < 80 ? "Downloading & decrypting..." : "Preparing file..."}
              </p>
            </div>
          ) : (
            <>
              {/* Download All / Download button */}
              {(isSingleFile || canDownloadAsZip) ? (
                <Button
                  className="w-full h-14 text-base rounded-full shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/15 transition-all hover:scale-[1.02]"
                  size="lg"
                  onClick={downloadAll}
                >
                  <Download className="w-5 h-5 mr-2" />
                  {isSingleFile
                    ? <>Download <span className="truncate max-w-[180px]">{firstFile?.decryptedName}</span></>
                    : "Download All as ZIP"}
                </Button>
              ) : (
                <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 text-center">
                  <p className="text-sm font-medium">Download files individually</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This drop is too large to package as a ZIP safely in your browser.
                  </p>
                </div>
              )}


              {/* File list for multi-file drops */}
              {!isSingleFile && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Or download individually:</p>

                  <div className="border rounded-lg divide-y">
                    {displayFiles.map((file) => {
                      const Icon = getFileIcon(file.decryptedName, file.mimeType);
                      return (
                        <div key={file.id} className="flex items-center gap-3 p-3 group">
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {file.decryptedName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(file.size)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="transition-opacity"
                            onClick={() => downloadFile(file.id)}
                            aria-label={`Download ${file.decryptedName}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  {hasMoreFiles && (
                    <button
                      onClick={() => setShowAllFiles(!showAllFiles)}
                      className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                      aria-expanded={showAllFiles}
                      aria-label={showAllFiles ? "Show fewer files" : `Show ${drop.files.length - 3} more files`}
                    >
                      {showAllFiles ? (
                        <>Show less <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>{drop.files.length - 3} more files <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* File info */}
          <div className="flex justify-center gap-6 text-sm text-muted-foreground">
            {expiryInfo && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {expiryInfo}
              </span>
            )}
            {drop.maxDownloads && (
              <span className="flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                {drop.downloads}/{drop.maxDownloads} downloads
              </span>
            )}
          </div>

          {/* Trust messaging */}
          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/70 text-center leading-relaxed">
              This file is decrypted in your browser. The key never reaches our servers - only someone with the key can decrypt it.
            </p>
          </div>
        </div>

        {/* Report abuse */}
        <div className="mt-6 text-center">
          <Link
            href={`/report?service=drop&id=${drop.id}`}
            prefetch={false}
            className="text-xs text-muted-foreground/60 hover:text-destructive transition-colors inline-flex items-center gap-1"
          >
            <AlertTriangle className="w-3 h-3" />
            Report abuse
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}
