"use client";

import { useState, useRef, useEffect } from "react";
import { Upload } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { extractFilesFromDataTransfer, prepareSelectedFiles } from "@/lib/drop-file-selection";

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  maxFileSize: number;
}

export function DropZone({ onFilesAdded, maxFileSize }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Handle paste-to-upload for modern file sharing UX
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = Array.from(items)
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length > 0) {
        onFilesAdded(prepareSelectedFiles(files));
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onFilesAdded]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    try {
      const extractedFiles = await extractFilesFromDataTransfer(e.dataTransfer);
      if (extractedFiles.length > 0) {
        onFilesAdded(extractedFiles);
      }
    } catch {
      // Fallback to simple file list
      if (e.dataTransfer?.files) {
        onFilesAdded(prepareSelectedFiles(e.dataTransfer.files));
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(prepareSelectedFiles(e.target.files));
    }
    // Reset either input so the same file/folder can be selected again.
    e.currentTarget.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop files here or click to select files for upload"
      onDrop={handleDrop}
      onDragOver={e => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      className={`
        relative rounded-2xl p-10 text-center transition-all duration-300 cursor-pointer
        border-2 border-dashed focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
        ${isDragging
          ? "border-primary/50 bg-primary/5 scale-[1.02]"
          : "border-muted-foreground/20 hover:border-primary/30 hover:bg-secondary/30"
        }
      `}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        onChange={handleFileSelect}
      />
      <input
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory: string; directory: string })}
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        onChange={handleFileSelect}
      />

      <div className={`transition-transform duration-300 ${isDragging ? "scale-110" : ""}`}>
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary/50 flex items-center justify-center">
          <Upload className={`w-7 h-7 transition-colors duration-300 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <p className="font-serif text-lg mb-1">Drop files or folders here</p>
        <p className="text-sm text-muted-foreground">
          or click to browse • Max {formatBytes(maxFileSize)}
        </p>
      </div>
    </div>
  );
}
