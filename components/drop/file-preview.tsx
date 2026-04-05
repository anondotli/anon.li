"use client";

import { useState, useCallback, useEffect } from "react";
import { Eye, EyeOff, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cryptoService } from "@/lib/crypto.client";
import { getPreviewIcon } from "@/lib/file-icons";
import {
  MAX_IMAGE_PREVIEW_SIZE,
  MAX_VIDEO_PREVIEW_SIZE,
  MAX_AUDIO_PREVIEW_SIZE,
  MAX_TEXT_PREVIEW_SIZE,
} from "@/lib/constants";

interface FilePreviewProps {
    dropId: string;
    fileId: string;
    filename: string;
    mimeType: string;
    keyString: string;
    ivString: string;
    size: number;
    chunkSize: number;
    chunkCount: number;
    children?: React.ReactNode;
}

function canPreview(mimeType: string, size: number): boolean {
    if (mimeType.startsWith("image/") && size <= MAX_IMAGE_PREVIEW_SIZE) return true;
    if (mimeType.startsWith("video/") && size <= MAX_VIDEO_PREVIEW_SIZE) return true;
    if (mimeType.startsWith("audio/") && size <= MAX_AUDIO_PREVIEW_SIZE) return true;
    if ((mimeType.startsWith("text/") || mimeType === "application/json") && size <= MAX_TEXT_PREVIEW_SIZE) return true;
    return false;
}

export function FilePreview({
    dropId,
    fileId,
    filename,
    mimeType,
    keyString,
    ivString,
    size,
    chunkSize,
    chunkCount,
    children,
}: FilePreviewProps) {
    const [loading, setLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // Cleanup blob URL on unmount
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const loadPreview = useCallback(async () => {
        if (!canPreview(mimeType, size)) {
            setError("File too large for preview");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Fetch encrypted file via proxy to avoid CORS
            const response = await fetch(`/api/v1/drop/${dropId}/file/${fileId}?preview=1`);
            if (!response.ok) throw new Error("Failed to fetch file");

            const encryptedData = await response.arrayBuffer();

            // Import key and decrypt
            const key = await cryptoService.importKey(keyString);
            const iv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(ivString));

            // Decrypt all chunks
            const decryptedChunks: ArrayBuffer[] = [];
            for (let i = 0; i < chunkCount; i++) {
                const start = i * (chunkSize + 16); // +16 for GCM auth tag
                const end = Math.min(start + chunkSize + 16, encryptedData.byteLength);
                const chunk = encryptedData.slice(start, end);
                const decrypted = await cryptoService.decryptChunk(chunk, key, iv, i);
                decryptedChunks.push(decrypted);
            }

            // Combine chunks
            const totalSize = decryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const combined = new Uint8Array(totalSize);
            let offset = 0;
            for (const chunk of decryptedChunks) {
                combined.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            // Handle different file types
            if (mimeType.startsWith("text/") || mimeType === "application/json") {
                const decoder = new TextDecoder();
                setTextContent(decoder.decode(combined));
            } else {
                const blob = new Blob([combined], { type: mimeType });
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            }

            setShowPreview(true);
        } catch {
            setError("Failed to load preview");
        } finally {
            setLoading(false);
        }
    }, [mimeType, size, fileId, dropId, keyString, ivString, chunkSize, chunkCount]);

    const closePreview = useCallback(() => {
        setShowPreview(false);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        setTextContent(null);
    }, [previewUrl]);

    // Can't preview
    if (!canPreview(mimeType, size)) {
        return null;
    }

    const Icon = getPreviewIcon(mimeType);

    if (loading) {
        return (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Decrypting preview...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-4 p-4 bg-destructive/10 rounded-lg text-center">
                <p className="text-sm text-destructive">{error}</p>
            </div>
        );
    }

    // Preview button (or custom trigger)
    if (!showPreview) {
        if (children) {
            return (
                <div onClick={loadPreview} className="cursor-pointer relative group">
                    {children}
                    {/* Hover overlay hint */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                        <Eye className="w-8 h-8 text-white" />
                    </div>
                </div>
            );
        }

        return (
            <Button
                variant="outline"
                size="sm"
                onClick={loadPreview}
                className="mt-4 w-full"
            >
                <Eye className="w-4 h-4 mr-2" />
                Preview {mimeType.startsWith("image/") ? "Image" :
                    mimeType.startsWith("video/") ? "Video" :
                        mimeType.startsWith("audio/") ? "Audio" : "File"}
            </Button>
        );
    }

    // Actual preview content
    return (
        <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="w-4 h-4" />
                    <span>{filename}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={closePreview}>
                    <EyeOff className="w-4 h-4 mr-1" />
                    Hide
                </Button>
            </div>

            <div className="rounded-lg overflow-hidden border bg-muted/20">
                {/* Image preview */}
                {mimeType.startsWith("image/") && previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={previewUrl}
                        alt={filename}
                        className="max-w-full max-h-[400px] mx-auto object-contain"
                    />
                )}

                {/* Video preview */}
                {mimeType.startsWith("video/") && previewUrl && (
                    <video
                        src={previewUrl}
                        controls
                        className="max-w-full max-h-[400px] mx-auto"
                    >
                        Your browser does not support video playback.
                    </video>
                )}

                {/* Audio preview */}
                {mimeType.startsWith("audio/") && previewUrl && (
                    <div className="p-6 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                            <Play className="w-8 h-8 text-primary" />
                        </div>
                        <audio src={previewUrl} controls className="w-full max-w-md" />
                    </div>
                )}

                {/* Text preview */}
                {textContent && (
                    <pre className="p-4 text-sm overflow-auto max-h-[400px] whitespace-pre-wrap break-words font-mono">
                        {textContent}
                    </pre>
                )}
            </div>
        </div>
    );
}
