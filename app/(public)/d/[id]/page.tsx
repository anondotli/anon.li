import { DropDownloadPage } from "@/components/drop";
import { getPublicDropMetadata } from "@/lib/drop-metadata";

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

export function generateMetadata() {
  return {
    title: { absolute: "Download | anon.li Drop" },
    description: "Download your encrypted files securely with anon.li Drop",
  };
}
