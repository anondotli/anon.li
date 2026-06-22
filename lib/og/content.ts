/**
 * Pure helpers + constants for Open Graph share images.
 *
 * Kept free of `next/og`, fs, and service imports so the logic can be unit-tested
 * in isolation and reused by the lightweight route config exports. The actual
 * image rendering lives in `./template.tsx`.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export const OG_TITLE_MAX = 70;
export const OG_SUBTITLE_MAX = 120;

export interface OgCardContent {
  /** Large serif headline. */
  title: string;
  /** Muted sub-headline below the title. */
  subtitle: string;
  /** Footer line shown next to the lock glyph. */
  footer: string;
  /** When false, the anon.li logo + wordmark are omitted (white-label forms). */
  showBranding: boolean;
}

/** The subset of a public form we need to build its share card. */
export interface FormOgInput {
  title: string;
  description: string | null;
  hideBranding: boolean;
}

/** Clamp a string to `max` characters, trimming and appending an ellipsis. */
export function truncate(value: string, max: number): string {
  const v = value.trim();
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1).trimEnd()}…`;
}

/** Build the share-card content for a public form (title/description are plaintext). */
export function formOgContent(form: FormOgInput): OgCardContent {
  const title = truncate(form.title?.trim() || "Untitled form", OG_TITLE_MAX);
  const description = form.description?.trim();
  const subtitle = description
    ? truncate(description, OG_SUBTITLE_MAX)
    : "A private, end-to-end encrypted form.";
  return {
    title,
    subtitle,
    footer: "End-to-end encrypted form",
    showBranding: !form.hideBranding,
  };
}

/**
 * Drops are zero-knowledge: the server cannot read the title, message, or file
 * names. The share card is therefore identical for every Drop — generic and
 * branded, with no per-drop data and no leak surface.
 */
export const DROP_OG_CONTENT: OgCardContent = {
  title: "Someone shared encrypted files",
  subtitle: "Securely, end-to-end encrypted.",
  footer: "anon.li Drop",
  showBranding: true,
};

/** Fallback when a form cannot be loaded (not found / taken down / error). */
export const FORM_FALLBACK_OG_CONTENT: OgCardContent = {
  title: "A private, encrypted form",
  subtitle: "Submit securely — responses are end-to-end encrypted.",
  footer: "anon.li Form",
  showBranding: true,
};
