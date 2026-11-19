import type { EngineClient, Job, Release, SourceRef } from "./client";

export type BulkSelection = "all" | "not_downloaded" | "missing_files";
export type AcquisitionStatus = {
  reference: SourceRef;
  acquired_versions: number;
  last_acquired_at: string | null;
  latest_job_id?: string | null;
  file_state?: string | null;
  saved_bytes?: number | null;
  source_revision?: string | null;
};
export const referenceKey = (reference: SourceRef) =>
  JSON.stringify([reference.provider, reference.id]);

export async function releaseStatuses(
  client: EngineClient,
  references: SourceRef[],
) {
  const unique = [
    ...new Map(references.map((r) => [referenceKey(r), r])).values(),
  ];
  const result: Record<string, AcquisitionStatus> = {};
  for (let start = 0; start < unique.length; start += 200) {
    const batch = unique.slice(start, start + 200);
    const statuses = await client.request<AcquisitionStatus[]>(
      "/v2/acquisitions/status",
      {
        method: "POST",
        body: { references: batch },
      },
    );
    for (const status of statuses)
      result[referenceKey(status.reference)] = status;
    if (batch.some((r) => !result[referenceKey(r)]))
      throw new Error(
        "Download status could not be checked for every selected item. Try again.",
      );
  }
  return result;
}

export function matchesBulkSelection(
  release: Release,
  mode: BulkSelection,
  statuses: Record<string, AcquisitionStatus>,
  active: Set<string>,
) {
  const key = referenceKey(release.reference);
  if (release.availability !== "available" || active.has(key)) return false;
  if (mode === "all") return true;
  const status = statuses[key];
  if (!status) return false;
  return (
    status.acquired_versions === 0 ||
    (mode === "missing_files" &&
      ["missing", "partial"].includes(status.file_state ?? ""))
  );
}

export async function activeReleaseKeys(client: EngineClient) {
  const jobs = await client.listAll<Job>("/v2/jobs?state=active");
  return new Set(
    jobs
      .filter((j) => !["completed", "canceled"].includes(j.state))
      .map((j) => referenceKey(j.plan.release.reference)),
  );
}
