import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Fonts for the OG image renderer. Satori (used by `next/og`) cannot parse the
 * `.woff2` files the app ships in `public/fonts`, so we vendor the `.woff`
 * siblings (same fontsource builds) under `assets/og`.
 */

export type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 600;
  style: "normal";
};

const FONT_DIR = join(process.cwd(), "assets", "og");

let cached: Promise<OgFont[]> | null = null;

/** Load (and memoize) the brand fonts. Buffers are reused across requests. */
export function loadOgFonts(): Promise<OgFont[]> {
  if (!cached) {
    cached = Promise.all([
      readFile(join(FONT_DIR, "geist-400.woff")),
      readFile(join(FONT_DIR, "geist-600.woff")),
      readFile(join(FONT_DIR, "playfair-500.woff")),
    ]).then(
      ([geist400, geist600, playfair500]): OgFont[] => [
        { name: "Geist", data: geist400, weight: 400, style: "normal" },
        { name: "Geist", data: geist600, weight: 600, style: "normal" },
        { name: "Playfair Display", data: playfair500, weight: 500, style: "normal" },
      ],
    );
    // Don't cache a rejected load — let the next request retry.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
