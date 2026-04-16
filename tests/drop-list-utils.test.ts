import { describe, expect, it } from "vitest";

import { formatDropExpiry, hasDropReachedDownloadLimit, isDropExpired } from "@/components/drop/drop-list-utils";

describe("drop list availability helpers", () => {
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
    // Create an expiry date 23 hours in the past — within the 24h grace period
    const recentlyExpired = new Date(Date.now() - 23 * 60 * 60 * 1000);

    expect(
      isDropExpired({
        downloads: 0,
        expiresAt: recentlyExpired.toISOString(),
        maxDownloads: null,
      })
    ).toBe(true);
    const formatted = formatDropExpiry(recentlyExpired.toISOString(), 0, null);
    // Should be in grace period — either "Deleting soon..." or "Deleting in Nh"
    expect(formatted).toMatch(/Deleting/);
  });

  it("keeps future drops available", () => {
    // Create an expiry date 2 days in the future
    const futureExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    expect(
      isDropExpired({
        downloads: 0,
        expiresAt: futureExpiry.toISOString(),
        maxDownloads: 3,
      })
    ).toBe(false);
    const formatted = formatDropExpiry(futureExpiry.toISOString(), 0, 3);
    expect(formatted).toMatch(/days/);
  });
});
