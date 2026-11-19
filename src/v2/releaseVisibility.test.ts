import { expect, it } from "vitest";
import type { Release } from "./client";
import { releaseVisible } from "./releaseVisibility";

it.each(["unavailable", "external"])(
  "hides %s unless requested, locally usable, active, or file status is unknown",
  (availability) => {
    const release = { availability } as Release;
    const status = {
      reference: { provider: "source", id: "item" },
      acquired_versions: 0,
      last_acquired_at: null,
    };
    expect(releaseVisible(release, false, status)).toBe(false);
    expect(releaseVisible(release, true, status)).toBe(true);
    expect(releaseVisible(release, false, undefined)).toBe(true);
    expect(releaseVisible(release, false, status, true)).toBe(true);
    for (const file_state of [
      "present",
      "modified",
      "missing",
      "partial",
      "destination_unavailable",
    ])
      expect(
        releaseVisible(release, false, {
          ...status,
          acquired_versions: 1,
          file_state,
        }),
      ).toBe(["present", "modified"].includes(file_state));
  },
);

it.each(["available", "unknown", "authentication_required"])(
  "keeps %s visible",
  (availability) => {
    expect(releaseVisible({ availability } as Release, false)).toBe(true);
  },
);
