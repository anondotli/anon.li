"use client";

import { Upload, RotateCcw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type UploadProgress as HookUploadProgress } from "@/hooks/use-drop-upload";

interface UploadProgressProps {
  progress: HookUploadProgress;
  pct: number;
  onCancel: () => void;
  onRetry: () => void;
  onReset: () => void;
}

export function UploadProgress({ progress, pct, onCancel, onRetry, onReset }: UploadProgressProps) {
  if (progress.phase === "error") {
    const isNetworkError = progress.error?.toLowerCase().includes("network") ||
                           progress.error?.toLowerCase().includes("fetch") ||
                           progress.error?.toLowerCase().includes("timeout");
    const isStorageError = progress.error?.toLowerCase().includes("storage") ||
                           progress.error?.toLowerCase().includes("quota");

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="p-6 bg-destructive/5 border border-destructive/10 rounded-2xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-serif text-lg text-destructive mb-2">Upload failed</p>
              <p className="text-sm text-muted-foreground mb-3">{progress.error}</p>
              {isNetworkError && (
                <p className="text-xs text-muted-foreground">
                  Check your internet connection and try again.
                </p>
              )}
              {isStorageError && (
                <p className="text-xs text-muted-foreground">
                  You may have exceeded your storage limit. Try uploading smaller files or upgrade your plan.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onReset} className="flex-1 rounded-full">Start Over</Button>
          <Button onClick={onRetry} className="flex-1 rounded-full">
            <RotateCcw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Active progress
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/5 flex items-center justify-center">
          <Upload className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <p className="font-serif text-xl mb-1">
          {progress.currentFileName}
          {progress.totalFiles > 1 && ` (${progress.currentFileIndex + 1}/${progress.totalFiles})`}
        </p>
        <p className="text-sm text-muted-foreground">
          {progress.phase === "encrypting" && "Encrypting your files..."}
          {progress.phase === "uploading" && "Uploading securely..."}
          {progress.phase === "finalizing" && "Almost done..."}
        </p>
      </div>
      <div className="space-y-2">
        <Progress value={pct} className="h-1.5" />
        <p className="text-xs text-center text-muted-foreground">{pct}%</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onCancel} className="w-full text-muted-foreground hover:text-foreground">
        Cancel
      </Button>
    </div>
  );
}
