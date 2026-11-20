import type { Destination, Plan, Problem, Recipe, Release, SourceRef } from "./client";
type ReviewOutcome =
  | "download"
  | "new_version"
  | "already_acquired"
  | "existing_job";
type ReviewItem = {
  plan: Plan;
  outcome: ReviewOutcome;
  files: string[];
  estimated_bytes: number | null;
};
export type Preparation = {
  id: string;
  expires_at: string;
  total?: number;
  next_cursor?: string | null;
  destination: Destination;
  items: ReviewItem[];
  outcomes?: Partial<Record<ReviewOutcome, number>>;
};
export type DownloadContext = {
  title: string;
  reference: SourceRef;
  destination_id: string;
  recipe: Recipe;
  policy: Record<string, unknown>;
  credential_profile?: string | null;
  automatic?: boolean;
  autoDownload?: boolean;
  selectedReleases?: SourceRef[];
  empty?: boolean;
  /**
   * Set by Refresh: `selectedReleases` came from an older listing, so they are
   * matched against the fresh listing of the same collection before the batch.
   */
  reconcile?: boolean;
  /** What Refresh left out of the selection, shown with the check. */
  leftOut?: string;
};
export type SelectionTask = {
  id: string;
  kind: "snapshot" | "batch";
  source_digest?: string;
  state: "working" | "ready" | "failed" | "canceled" | "submitted";
  request: {
    release_refs?: SourceRef[];
    reference?: SourceRef;
    credential_profile?: string | null;
    snapshot_id?: string;
    /** A batch's explicit releases; absent when it covers every match in its snapshot. */
    releases?: SourceRef[];
    destination_id?: string;
    recipe?: Recipe;
    policy?: Record<string, unknown>;
  };
  processed: number;
  total: number;
  issue: Problem | null;
  expires_at: string | null;
  outcomes?: Partial<Record<ReviewOutcome, number>>;
  created_at?: string;
  updated_at?: string;
};
export function reviewCounts(preview: Preparation) {
  const counts: Record<ReviewOutcome, number> = {
    download: 0,
    new_version: 0,
    already_acquired: 0,
    existing_job: 0,
  };
  if (preview.outcomes) Object.assign(counts, preview.outcomes);
  else for (const item of preview.items) counts[item.outcome]++;
  return {
    ...counts,
    toDownload: counts.download + counts.new_version,
    checked: preview.total ?? preview.items.length,
  };
}
export function formatRecipe(recipe: string) {
  return (
    (
      {
        original_images: "Original images",
        cbz: "CBZ archive",
        image_folder: "Chapter folder",
        mp4: "MP4 video",
        mkv: "Matroska video",
        webm: "WebM video",
        m4a: "M4A audio",
        mp3: "MP3 audio",
        opus: "Opus audio",
      } as Record<string, string>
    )[recipe] ?? recipe.toUpperCase()
  );
}
export function reusableCheck(task: SelectionTask, now = Date.now()) {
  if (task.expires_at && Date.parse(task.expires_at) <= now) return false;
  return (
    task.kind !== "snapshot" ||
    task.state !== "ready" ||
    !task.created_at ||
    Date.parse(task.created_at) + 15 * 60_000 > now
  );
}
/** Problem codes for a check whose source list moved on after OMD listed it. */
const refreshableIssues: Record<string, string> = {
  selection_changed:
    "A selected item changed on the source since it was listed. Refresh and try again.",
  source_changed:
    "The source’s list changed while it was being checked. Refresh and try again.",
};
/**
 * Plain wording for a check's problem, and whether rebuilding the list from the
 * source (Refresh) is the next step. Other problems keep the engine's message.
 */
export function checkIssue(problem: Problem | null | undefined) {
  if (!problem) return null;
  const refresh = refreshableIssues[problem.code];
  return { message: refresh ?? problem.message, refresh: !!refresh };
}
export function reviewStatus(task: SelectionTask) {
  return {
    working: task.kind === "snapshot" ? "Finding items" : "Checking files",
    ready: task.kind === "snapshot" ? "Ready to check" : "Ready for review",
    failed: "Check needs attention",
    canceled: "Check canceled",
    submitted: "Downloads added",
  }[task.state];
}
export function contextsFromStorage(): Record<string, DownloadContext> {
  try {
    return JSON.parse(localStorage.getItem("omd.download-checks") ?? "{}");
  } catch {
    return {};
  }
}
export function dismissedFromStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem("omd.dismissed-checks") ?? "[]");
  } catch {
    return [];
  }
}

/** Only a successful, complete result can conclude that nothing needs downloading. */
export function finishedWithoutDownloads(task: SelectionTask, context?: DownloadContext): boolean {
  if (task.state !== "ready" || task.issue) return false;
  if (context?.empty) return true;
  if (task.kind === "snapshot") return task.processed === 0;
  if (task.total === 0) return true;
  const outcomes = task.outcomes;
  if (!outcomes) return false;
  const counts = [outcomes.download ?? 0, outcomes.new_version ?? 0, outcomes.already_acquired ?? 0, outcomes.existing_job ?? 0];
  return counts.every(n => Number.isSafeInteger(n) && n >= 0)
    && counts[0] === 0 && counts[1] === 0
    && counts.reduce((sum, n) => sum + n, 0) === task.total;
}

const releaseKey = (reference: SourceRef) => JSON.stringify([reference.provider, reference.id]);
/**
 * Matches a refreshed selection against a fresh listing of its own collection,
 * using the engine's batch criteria (available, and allowed by the policy's
 * languages and groups). `kept` keeps the listing's order; the rest were left out.
 */
export function reconcileSelection(
  selected: SourceRef[],
  listed: Pick<Release, "reference" | "availability" | "language" | "group">[],
  policy: Record<string, unknown>,
) {
  const wanted = new Set(selected.map(releaseKey));
  const languages = (policy.languages as string[] | undefined) ?? [];
  const groups = (policy.groups as string[] | undefined) ?? [];
  const kept: SourceRef[] = [], seen = new Set<string>();
  let unavailable = 0;
  for (const release of listed) {
    const key = releaseKey(release.reference);
    if (!wanted.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (
      release.availability === "available" &&
      (!languages.length || !release.language || languages.includes(release.language)) &&
      (!groups.length || (!!release.group && groups.includes(release.group)))
    )
      kept.push(release.reference);
    else unavailable++;
  }
  return { kept, missing: wanted.size - seen.size, unavailable };
}
const items = (n: number) => `${n} selected ${n === 1 ? "item" : "items"}`;
/** Plain wording for what Refresh left out, or null when every item is still there. */
export function reconcileNotice(
  title: string,
  result: { kept: SourceRef[]; missing: number; unavailable: number },
) {
  const parts = [
    result.missing && `${items(result.missing)} ${result.missing === 1 ? "is" : "are"} no longer in ${title}`,
    result.unavailable &&
      (result.missing
        ? `${result.unavailable} can’t be downloaded right now`
        : `${items(result.unavailable)} can’t be downloaded from ${title} right now`),
  ].filter(Boolean);
  if (!parts.length) return null;
  const left = parts.join(", and ");
  return result.kept.length
    ? `${left[0].toUpperCase()}${left.slice(1)}. ${result.missing + result.unavailable === 1 ? "It was" : "They were"} left out; the other ${result.kept.length === 1 ? "item is" : `${result.kept.length} items are`} being checked.`
    : `${left[0].toUpperCase()}${left.slice(1)}. Nothing from this selection can be downloaded now. Open ${title} to choose again.`;
}
