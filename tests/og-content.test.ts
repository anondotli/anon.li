import { describe, expect, it } from "vitest";

import {
  DROP_OG_CONTENT,
  FORM_FALLBACK_OG_CONTENT,
  OG_SIZE,
  OG_SUBTITLE_MAX,
  OG_TITLE_MAX,
  formOgContent,
  truncate,
} from "@/lib/og/content";

describe("truncate", () => {
  it("leaves short strings untouched (trimmed)", () => {
    expect(truncate("  hello  ", 20)).toBe("hello");
  });

  it("clamps long strings and appends an ellipsis", () => {
    const out = truncate("a".repeat(100), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("formOgContent", () => {
  it("uses the plaintext title and description", () => {
    const content = formOgContent({
      title: "Customer Feedback Survey",
      description: "Share your thoughts — takes 2 minutes",
      hideBranding: false,
    });
    expect(content.title).toBe("Customer Feedback Survey");
    expect(content.subtitle).toBe("Share your thoughts — takes 2 minutes");
    expect(content.footer).toBe("End-to-end encrypted form");
    expect(content.showBranding).toBe(true);
  });

  it("falls back to a default subtitle when description is null or blank", () => {
    expect(formOgContent({ title: "T", description: null, hideBranding: false }).subtitle).toBe(
      "A private, end-to-end encrypted form.",
    );
    expect(formOgContent({ title: "T", description: "   ", hideBranding: false }).subtitle).toBe(
      "A private, end-to-end encrypted form.",
    );
  });

  it("uses a placeholder when the title is blank", () => {
    expect(formOgContent({ title: "   ", description: null, hideBranding: false }).title).toBe(
      "Untitled form",
    );
  });

  it("omits branding for white-label (hideBranding) forms", () => {
    const content = formOgContent({ title: "T", description: null, hideBranding: true });
    expect(content.showBranding).toBe(false);
    // The footer must never reintroduce the brand name for white-label forms.
    expect(content.footer).not.toMatch(/anon\.li/i);
  });

  it("truncates over-long titles and descriptions", () => {
    const content = formOgContent({
      title: "Title ".repeat(40),
      description: "Description ".repeat(40),
      hideBranding: false,
    });
    expect(content.title.length).toBeLessThanOrEqual(OG_TITLE_MAX);
    expect(content.subtitle.length).toBeLessThanOrEqual(OG_SUBTITLE_MAX);
    expect(content.title.endsWith("…")).toBe(true);
    expect(content.subtitle.endsWith("…")).toBe(true);
  });
});

describe("static card content", () => {
  it("Drop card is generic and branded (zero-knowledge — no per-drop data)", () => {
    expect(DROP_OG_CONTENT.showBranding).toBe(true);
    expect(DROP_OG_CONTENT.title).toBe("Someone shared encrypted files");
  });

  it("Form fallback card is branded", () => {
    expect(FORM_FALLBACK_OG_CONTENT.showBranding).toBe(true);
    expect(FORM_FALLBACK_OG_CONTENT.footer).toBe("anon.li Form");
  });

  it("uses the standard 1200x630 OG dimensions", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});
