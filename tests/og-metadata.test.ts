import { beforeEach, describe, expect, it, vi } from "vitest";

// Avoid pulling in the page components / Prisma client at import time.
vi.mock("@/components/form/public/submission-page", () => ({
  FormSubmissionPage: () => null,
}));
vi.mock("@/components/drop", () => ({ DropDownloadPage: () => null }));
vi.mock("@/lib/drop-metadata", () => ({ getPublicDropMetadata: vi.fn() }));
vi.mock("@/lib/services/form", () => ({
  FormService: { getPublicForm: vi.fn() },
}));

import { generateMetadata as dropMetadata } from "@/app/(public)/d/[id]/page";
import { generateMetadata as formMetadata } from "@/app/(public)/f/[id]/page";
import { FormService } from "@/lib/services/form";

const getPublicForm = vi.mocked(FormService.getPublicForm);

function robotsIndex(meta: { robots?: unknown }): boolean | undefined {
  return (meta.robots as { index?: boolean } | undefined)?.index;
}

function ogTitle(meta: { openGraph?: unknown }): unknown {
  return (meta.openGraph as { title?: unknown } | undefined)?.title;
}

describe("Drop generateMetadata", () => {
  it("sets generic openGraph/twitter and noindex", () => {
    const meta = dropMetadata();
    expect(ogTitle(meta)).toBe("Someone shared encrypted files with you");
    expect((meta.twitter as { card?: string }).card).toBe("summary_large_image");
    expect(robotsIndex(meta)).toBe(false);
  });
});

describe("Form generateMetadata", () => {
  beforeEach(() => {
    getPublicForm.mockReset();
  });

  it("propagates the plaintext title/description into openGraph + twitter", async () => {
    getPublicForm.mockResolvedValue({
      title: "Customer Feedback Survey",
      description: "Share your thoughts",
    } as Awaited<ReturnType<typeof FormService.getPublicForm>>);

    const meta = await formMetadata({ params: Promise.resolve({ id: "abc" }) });

    expect(ogTitle(meta)).toBe("Customer Feedback Survey");
    expect((meta.openGraph as { description?: string }).description).toBe("Share your thoughts");
    expect((meta.twitter as { title?: string }).title).toBe("Customer Feedback Survey");
    expect(robotsIndex(meta)).toBe(false);
  });

  it("falls back to a default description when the form has none", async () => {
    getPublicForm.mockResolvedValue({
      title: "Untitled",
      description: null,
    } as Awaited<ReturnType<typeof FormService.getPublicForm>>);

    const meta = await formMetadata({ params: Promise.resolve({ id: "abc" }) });
    expect((meta.openGraph as { description?: string }).description).toBe(
      "A private, end-to-end encrypted form.",
    );
  });

  it("returns a generic noindex result when the form cannot be loaded", async () => {
    getPublicForm.mockRejectedValue(new Error("not found"));

    const meta = await formMetadata({ params: Promise.resolve({ id: "missing" }) });

    expect(meta.openGraph).toBeUndefined();
    expect(robotsIndex(meta)).toBe(false);
  });
});
