"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useFileDrop } from "@/hooks/use-file-drop";
import { useDropUpload } from "@/hooks/use-drop-upload";
import { formatBytes } from "@/lib/utils";
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils";

import { Button } from "@/components/ui/button";
import { Turnstile } from "@/components/ui/turnstile";
import { UpgradeRequiredDialog } from "@/components/upgrade/upgrade-required-dialog";

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
  guest?: boolean;
}

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function FileUploader({ onUploadComplete, userTier, maxStorage, usedStorage, guest = false }: FileUploaderProps) {
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

  const [upgradeDetails, setUpgradeDetails] = useState<UpgradeRequiredDetails | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileRenderKey, setTurnstileRenderKey] = useState(0);

  const remainingBandwidth = (maxStorage !== undefined && usedStorage !== undefined)
    ? Number(maxStorage - usedStorage)
    : undefined;

  const {
    files, setFiles,
    progress, shareUrl, dropMeta,
    features, maxFileSize, maxExpiry,
    upload, cancel,
    reset: resetUploadState,
  } = useDropUpload({
    userTier,
    remainingStorage: remainingBandwidth,
    guest,
    onComplete: onUploadComplete,
    onUpgradeRequired: setUpgradeDetails,
  });

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileRenderKey(key => key + 1);
  }, []);

  // Compute effective expiry days
  const effectiveExpiryDays = config.expiryDays !== null
    ? config.expiryDays
    : (maxExpiry ?? "");


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

  const startUpload = useCallback(() => {
    if (files.length === 0) return;

    if (guest && turnstileSiteKey && !turnstileToken) {
      toast.error("Please complete the verification challenge.");
      return;
    }

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
      ...(guest && turnstileToken ? { turnstileToken } : {}),
    });

    if (guest && turnstileSiteKey) {
      resetTurnstile();
    }
  }, [files.length, guest, turnstileToken, upload, config, effectiveExpiryDays, resetTurnstile]);

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

  const upgradeDialog = (
    <UpgradeRequiredDialog
      open={upgradeDetails !== null}
      onOpenChange={(open) => { if (!open) setUpgradeDetails(null); }}
      details={upgradeDetails}
    />
  );

  if (shareUrl) {
    return (
      <>
        <SuccessView
          shareUrl={shareUrl}
          password={config.password}
          fileCount={files.length || 1}
          totalSize={totalSize}
          expiresAt={dropMeta?.expiresAt ? new Date(dropMeta.expiresAt) : undefined}
          maxDownloads={dropMeta?.maxDownloads}
          onReset={reset}
        />
        {upgradeDialog}
      </>
    );
  }

  if (progress && progress.phase !== "complete") {
    return (
      <>
        <UploadProgress
          progress={progress}
          pct={pct}
          onCancel={cancel}
          onRetry={startUpload}
          onReset={reset}
        />
        {upgradeDialog}
      </>
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
          {guest && turnstileSiteKey && (
            <Turnstile
              key={turnstileRenderKey}
              siteKey={turnstileSiteKey}
              onVerify={setTurnstileToken}
              onError={resetTurnstile}
              onExpire={() => setTurnstileToken(null)}
            />
          )}

          <Button
            className="w-full h-12 rounded-full text-base font-medium shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/15 transition-all hover:scale-[1.02]"
            onClick={startUpload}
            disabled={(config.protectionMode === "password" && config.password.length < 8) || (guest && !!turnstileSiteKey && !turnstileToken)}
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
        {upgradeDialog}
      </div>
    );
  }

  return (
    <>
      <DropZone onFilesAdded={addFiles} maxFileSize={maxFileSize} />
      {upgradeDialog}
    </>
  );
}
