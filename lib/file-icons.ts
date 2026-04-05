/**
 * Shared file icon utilities
 *
 * This module provides a unified way to get icons for files
 * based on their mime type or filename extension.
 */

import {
  FileIcon,
  ImageIcon,
  Video,
  Music,
  FileText,
  FileCode,
  Archive,
  type LucideIcon,
} from "lucide-react";

// Extension to icon mapping
const EXTENSION_ICONS: Record<string, LucideIcon> = {
  // Images
  jpg: ImageIcon,
  jpeg: ImageIcon,
  png: ImageIcon,
  gif: ImageIcon,
  webp: ImageIcon,
  svg: ImageIcon,
  bmp: ImageIcon,
  ico: ImageIcon,

  // Videos
  mp4: Video,
  webm: Video,
  mov: Video,
  avi: Video,
  mkv: Video,
  flv: Video,
  wmv: Video,

  // Audio
  mp3: Music,
  wav: Music,
  ogg: Music,
  flac: Music,
  m4a: Music,
  aac: Music,

  // Archives
  zip: Archive,
  rar: Archive,
  "7z": Archive,
  tar: Archive,
  gz: Archive,
  bz2: Archive,

  // Documents
  txt: FileText,
  md: FileText,
  doc: FileText,
  docx: FileText,
  pdf: FileText,
  rtf: FileText,
  odt: FileText,

  // Code
  js: FileCode,
  ts: FileCode,
  tsx: FileCode,
  jsx: FileCode,
  html: FileCode,
  css: FileCode,
  py: FileCode,
  json: FileCode,
  xml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  sh: FileCode,
  bash: FileCode,
  go: FileCode,
  rs: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
};

/**
 * Get the appropriate icon for a file based on filename and/or mime type
 *
 * @param filename - Optional filename to extract extension from
 * @param mimeType - Optional mime type
 * @returns The appropriate Lucide icon component
 */
export function getFileIcon(filename?: string, mimeType?: string): LucideIcon {
  // Try extension first (more specific)
  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && EXTENSION_ICONS[ext]) {
      return EXTENSION_ICONS[ext];
    }
  }

  // Fall back to mime type
  if (mimeType) {
    const mime = mimeType.toLowerCase();
    if (mime.startsWith("image/")) return ImageIcon;
    if (mime.startsWith("video/")) return Video;
    if (mime.startsWith("audio/")) return Music;
    if (mime.includes("zip") || mime.includes("archive") || mime.includes("compressed")) return Archive;
    if (mime.includes("text/") || mime.includes("pdf") || mime.includes("document")) return FileText;
    if (mime.includes("javascript") || mime.includes("json") || mime.includes("xml")) return FileCode;
  }

  return FileIcon;
}

/**
 * Get icon based only on mime type (simpler version for preview)
 */
export function getPreviewIcon(mimeType: string): LucideIcon {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType.startsWith("audio/")) return Music;
  if (mimeType.startsWith("text/") || mimeType === "application/json") return FileText;
  return FileIcon;
}
