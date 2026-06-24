import type { Metadata } from "next";
import { DropDownloadPage } from "@/components/drop";
import { getPublicDropMetadata } from "@/lib/drop-metadata";
import { siteConfig } from "@/config/site";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DropPage({ params }: PageProps) {
  const { id } = await params;
  let initialDrop = null;
  let initialError: string | null = null;

  try {
    initialDrop = await getPublicDropMetadata(id);
    if (!initialDrop) {
      initialError = "Drop not found";
    }
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Failed to load drop";
  }

  return (
    <DropDownloadPage
      key={id}
      fileId={id}
      initialDrop={initialDrop}
      initialError={initialError}
    />
  );
}

// Drops are zero-knowledge, so the share preview is generic and branded — no
// per-drop data. The opengraph-image.tsx / twitter-image.tsx files in this
// segment supply the image; metadataBase (root layout) makes the URL absolute.
export function generateMetadata(): Metadata {
  // Plain string so the parent "%s | anon.li" template appends cleanly.
  const ogTitle = "Someone shared encrypted files with you";
  const ogDescription =
    "A private, end-to-end encrypted file transfer. Only people with the link can decrypt the files.";
  return {
    title: { absolute: "Download | anon.li Drop" },
    description: "Download your encrypted files securely with anon.li Drop",
    openGraph: {
      type: "website",
      siteName: siteConfig.default.name,
      title: ogTitle,
      description: ogDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
    },
    // Private, ephemeral links — keep them out of search engines. Social
    // crawlers ignore robots meta, so previews still unfurl.
    robots: { index: false, follow: false },
    // Defense in depth: never leak the `?r=` recipient token (or the URL) to R2
    // or any third party via the Referer header.
    referrer: "no-referrer",
  };
}
