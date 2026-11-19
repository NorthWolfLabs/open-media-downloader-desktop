import type { Release } from "./client";
import type { AcquisitionStatus } from "./releaseSelection";

export function usableLocalFiles(status?: AcquisitionStatus) {
  return (
    !!status?.acquired_versions &&
    ["present", "modified"].includes(status.file_state ?? "")
  );
}

export function releaseVisible(
  release: Release,
  showUnavailable: boolean,
  status?: AcquisitionStatus,
  active = false,
) {
  // Unknown availability and sign-in requirements are actionable information.
  if (!["unavailable", "external"].includes(release.availability)) return true;
  // A failed status lookup cannot establish whether a usable local copy exists.
  return showUnavailable || active || usableLocalFiles(status) || !status;
}
