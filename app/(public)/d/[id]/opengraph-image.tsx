import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og/content";
import { renderDropOgImage } from "@/lib/og/template";

export const alt = "Encrypted files shared via anon.li Drop";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const revalidate = 86400;

export default function Image() {
  return renderDropOgImage();
}
