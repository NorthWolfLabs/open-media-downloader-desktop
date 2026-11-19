import type { Destination, Plan, Problem, Recipe, SourceRef } from "./client";
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
