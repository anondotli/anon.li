import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/content";
import { renderFormOgImage } from "@/lib/og/template";

export const alt = "A private, end-to-end encrypted form on anon.li";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderFormOgImage(id);
}
