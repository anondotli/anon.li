"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useFileDrop } from "@/hooks/use-file-drop";
import { useDropUpload } from "@/hooks/use-drop-upload";
import { formatBytes } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Turnstile } from "@/components/ui/turnstile";

import { DropZone } from "./upload/drop-zone";
import { FileList } from "./upload/file-list";
import { DropSettings, type DropConfig } from "./upload/drop-settings";
import { UploadProgress } from "./upload/upload-progress";
import { SuccessView } from "./upload/success-view";

interface FileUploaderProps {
  onUploadComplete?: (fileId: string, shareUrl: string) => void;
  userTier?: string | null;
  maxStorage?: bigint;
  usedStorage?: bigint;
  isAuthenticated?: boolean;
}

export function FileUploader({ onUploadComplete, userTier, maxStorage, usedStorage, isAuthenticated }: FileUploaderProps) {
  const { droppedFiles, setDroppedFiles } = useFileDrop();

  const [config, setConfig] = useState<DropConfig>({
    title: "",
    protectionMode: "key",
    password: "",
    expiryDays: null,
    maxDownloads: "",
    hideBranding: false,
    notifyOnDownload: false,
  });

  const updateConfig = useCallback((updates: Partial<DropConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  // Captcha State
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  const remainingBandwidth = (maxStorage !== undefined && usedStorage !== undefined)
    ? Number(maxStorage - usedStorage)
    : undefined;

  const {
    files, setFiles,
    progress, shareUrl, dropMeta,
    features, maxFileSize, maxExpiry,
    upload, cancel,
    reset: resetUploadState,
  } = useDropUpload({ userTier, remainingStorage: remainingBandwidth, isAuthenticated, onComplete: onUploadComplete });

  // Compute effective expiry days
  const effectiveExpiryDays = config.expiryDays !== null
    ? config.expiryDays
    : (maxExpiry !== undefined && maxExpiry !== -1 ? maxExpiry : "");


  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const addFiles = useCallback((newFiles: File[]) => {
    const valid: File[] = [];
    let currentTotal = totalSize;

    for (const f of newFiles) {
      if (currentTotal + f.size > maxFileSize) {
        toast.error(`Total size exceeds ${formatBytes(maxFileSize)}`);
        break;
      }
      valid.push(f);
      currentTotal += f.size;
    }

    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
    }
  }, [totalSize, maxFileSize, setFiles]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, [setFiles]);

  // Handle global drop
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      addFiles(droppedFiles);
      setDroppedFiles(null);
    }
  }, [droppedFiles, setDroppedFiles, addFiles]);

  const reset = useCallback(() => {
    resetUploadState();
    setConfig({
      title: "",
      protectionMode: "key",
      password: "",
      expiryDays: null,
      maxDownloads: "",
      hideBranding: false,
      notifyOnDownload: false,
    });
  }, [resetUploadState]);

  const startUpload = useCallback((turnstile?: string | null) => {
    if (files.length === 0) return;

    const expiryValue = typeof effectiveExpiryDays === 'string'
      ? parseInt(effectiveExpiryDays, 10) || undefined
      : effectiveExpiryDays || undefined;

    const maxDlValue = config.maxDownloads ? parseInt(config.maxDownloads, 10) : undefined;

    upload({
      title: config.title || undefined,
      expiryDays: expiryValue,
      maxDownloads: maxDlValue,
      password: config.protectionMode === "password" ? config.password : undefined,
      hideBranding: config.hideBranding,
      notifyOnDownload: config.notifyOnDownload,
    }, turnstile);
  }, [files.length, upload, config, effectiveExpiryDays]);

  // Calculate progress percentage
  const pct = progress
    ? Math.round(
      progress.totalChunks === 0
        ? (progress.phase === "encrypting" ? 5 : progress.phase === "uploading" ? 50 : 0)
        : progress.phase === "encrypting" ? (progress.uploadedChunks / progress.totalChunks) * 30
          : progress.phase === "uploading" ? 30 + (progress.uploadedChunks / progress.totalChunks) * 65
            : progress.phase === "finalizing" ? 95
              : progress.phase === "complete" ? 100 : 0
    )
    : 0;

  // View States

  if (shareUrl) {
    return (
      <SuccessView
        shareUrl={shareUrl}
        password={config.password}
        fileCount={files.length || 1}
        totalSize={totalSize}
        expiresAt={dropMeta?.expiresAt ? new Date(dropMeta.expiresAt) : undefined}
        maxDownloads={dropMeta?.maxDownloads}
        onReset={reset}
      />
    );
  }

  if (progress && progress.phase !== "complete") {
    return (
      <UploadProgress
        progress={progress}
        pct={pct}
        onCancel={cancel}
        onRetry={() => startUpload(turnstileToken)}
        onReset={reset}
      />
    );
  }

  if (files.length > 0) {
    return (
      <div className="space-y-6">
        <FileList
          files={files}
          onRemove={removeFile}
          onAddMore={addFiles}
        />

        <div className="grid gap-6">
          {/* Turnstile for anonymous users */}
          {!userTier && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
            <div className="flex flex-col items-center gap-2 py-2">
              <Turnstile
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onVerify={(token) => {
                  setTurnstileToken(token);
                  setCaptchaError(null);
                }}
                onError={() => setCaptchaError("Failed to load captcha. Please refresh the page.")}
                onExpire={() => setTurnstileToken(null)}
              />
              {captchaError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {captchaError}
                </p>
              )}
              {!turnstileToken && !captchaError && (
                <p className="text-xs text-muted-foreground">Verifying you&apos;re human...</p>
              )}
            </div>
          )}

          {!userTier && (
            <p className="text-xs text-muted-foreground/70 text-center leading-relaxed px-4">
              Your files are encrypted in this browser before upload. No account or personal data is associated with this drop.
            </p>
          )}

          <Button
            className="w-full h-12 rounded-full text-base font-medium shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/15 transition-all hover:scale-[1.02]"
            onClick={() => startUpload(turnstileToken)}
            disabled={(config.protectionMode === "password" && config.password.length < 8) || (!userTier && !turnstileToken && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Create Drop
          </Button>

          <DropSettings
            config={{
                ...config,
                expiryDays: effectiveExpiryDays
            }}
            onUpdate={updateConfig}
            showTitleInput={files.length > 1}
            maxExpiry={maxExpiry}
            features={features}
          />
        </div>
      </div>
    );
  }

  return <DropZone onFilesAdded={addFiles} maxFileSize={maxFileSize} />;
}
