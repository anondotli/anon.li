import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDropExpiry, hasDropReachedDownloadLimit, isDropExpired } from "@/components/drop/drop-list-utils";

describe("drop list availability helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks download-limit drops as expired", () => {
    expect(hasDropReachedDownloadLimit(1, 1)).toBe(true);
    expect(
      isDropExpired({
        downloads: 1,
        expiresAt: null,
        maxDownloads: 1,
      })
    ).toBe(true);
    expect(formatDropExpiry(null, 1, 1)).toBe("Limit reached");
  });

  it("marks time-expired drops as expired during the cleanup grace period", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T12:00:00.000Z"));
    const recentlyExpiredDrop = "2026-04-03T12:30:00.000Z";

    expect(
      isDropExpired({
        downloads: 0,
        expiresAt: recentlyExpiredDrop,
        maxDownloads: null,
      })
    ).toBe(true);
    expect(formatDropExpiry(recentlyExpiredDrop, 0, null)).toBe("Deleting soon...");
  });

  it("keeps future drops available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T00:00:00.000Z"));

    expect(
      isDropExpired({
        downloads: 0,
        expiresAt: "2026-04-06T00:00:00.000Z",
        maxDownloads: 3,
      })
    ).toBe(false);
    expect(formatDropExpiry("2026-04-06T00:00:00.000Z", 0, 3)).toBe("2 days");
  });
});
