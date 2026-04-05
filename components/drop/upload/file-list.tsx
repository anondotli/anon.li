"use client";

import { useRef } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFileIcon } from "@/lib/file-icons";
import { formatBytes } from "@/lib/utils";

interface FileListProps {
  files: File[];
  onRemove: (index: number) => void;
  onAddMore: (files: File[]) => void;
}

export function FileList({ files, onRemove, onAddMore }: FileListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddMore(Array.from(e.target.files));
    }
    // Reset input
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
      {files.map((f, i) => {
        const Icon = getFileIcon(f.name, f.type);
        return (
          <div key={`${f.name}-${i}`} className="flex items-center gap-3 p-4 bg-secondary/50 rounded-xl group transition-colors hover:bg-secondary/80">
            <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${f.name}`}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border/50 hover:border-primary/30 rounded-xl transition-all"
      >
        <Plus className="w-4 h-4" /> Add more
      </button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
