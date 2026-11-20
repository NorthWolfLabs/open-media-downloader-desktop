import { reusableCheck, type SelectionTask } from "./downloadReview";
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import { checkIssue, reconcileNotice, reconcileSelection, reviewCounts, type Preparation } from "./downloadReview";
import DownloadReview from "./DownloadReview.svelte";
import DownloadCheck from "./DownloadCheck.svelte";
import DownloadChecks from "./DownloadChecks.svelte";
afterEach(cleanup);
const item = (outcome = "download") => ({
  outcome,
  plan: {
    collection: { title: "Example title" },
    release: { title: "Chapter 1", language: "en" },
    recipe: "cbz",
    outputs: [{}],
    final_relative_path: "Example/Chapter 1",
  },
  files: ["chapter.cbz", "ComicInfo.xml"],
  estimated_bytes: null,
});
const preview = () =>
  ({
    id: "batch",
    expires_at: "2030-01-01",
    destination: { label: "My library", root: "/library" },
    items: [item()],
    total: 753,
    next_cursor: "1",
    outcomes: {
      download: 200,
      new_version: 2,
      already_acquired: 550,
      existing_job: 1,
    },
  }) as unknown as Preparation;
function dialogs() {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
}
it("uses complete checked totals rather than the currently loaded preview page", () => {
  expect(reviewCounts(preview())).toEqual({
    download: 200,
    new_version: 2,
    already_acquired: 550,
    existing_job: 1,
    toDownload: 202,
    checked: 753,
  });
});
it("shows an explicit download count and keeps filesystem details collapsed", async () => {
  dialogs();
  const confirm = vi.fn();
  render(DownloadReview, {
    preview: preview(),
    onconfirm: confirm,
    onclose: vi.fn(),
    onmore: vi.fn(),
  });
  expect(screen.getByText("550 already saved")).toBeTruthy();
  expect(screen.getByText("Files and folder").closest("details")!.open).toBe(
    false,
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Download 202 items" }),
  );
  expect(confirm).toHaveBeenCalledOnce();
});
it("all-skipped reviews finish without submitting downloads", async () => {
  dialogs();
  const done = vi.fn(),
    confirm = vi.fn();
  const p = preview();
  p.items = [item("already_acquired")] as any;
  p.total = 1;
  p.next_cursor = null;
  p.outcomes = { already_acquired: 1 };
  render(DownloadReview, {
    preview: p,
    onconfirm: confirm,
    onclose: done,
    onmore: vi.fn(),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(done).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});
it("a canceled check names the consequence and provides a continuation", async () => {
  dialogs();
  const action = vi.fn();
  render(DownloadCheck, {
    props: {
      task: {
        id: "batch",
        kind: "batch",
        state: "canceled",
        processed: 6,
        total: 234,
        request: {},
        issue: null,
        expires_at: null,
      },
      context: {
        title: "Example title",
        reference: { provider: "source", id: "one" },
        destination_id: "dest",
        recipe: "cbz",
        policy: { languages: ["en"] },
      },
      onclose: vi.fn(),
      onaction: action,
      onreview: vi.fn(),
      onoptions: vi.fn(),
      ondismiss: vi.fn(),
    },
  });
  expect(screen.getByText(/No downloads were started/)).toBeTruthy();
  expect(screen.getByText("6 of 234 items checked")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  await fireEvent.click(
    screen.getByRole("button", { name: "Continue checking" }),
  );
  expect(action).toHaveBeenCalledWith("retry");
});

it("limits completed collection scan reuse to fifteen minutes while preserving valid batch previews", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const task = {
    kind: "snapshot",
    state: "ready",
    created_at: "2026-09-08T11:44:59Z",
    expires_at: "2026-09-09T12:00:00Z",
  } as SelectionTask;
  expect(reusableCheck(task, now)).toBe(false);
  expect(
    reusableCheck({ ...task, created_at: "2026-09-08T11:46:00Z" }, now),
  ).toBe(true);
  expect(reusableCheck({ ...task, kind: "batch" }, now)).toBe(true);
  expect(
    reusableCheck(
      { ...task, kind: "batch", expires_at: "2026-09-08T11:59:00Z" },
      now,
    ),
  ).toBe(false);
});


it("recognizes successful no-op results without hiding failed or incomplete checks", async () => {
  const { finishedWithoutDownloads } = await import("./downloadReview");
  const task = { id: "empty", kind: "batch", state: "ready", processed: 3, total: 3, issue: null, request: {}, expires_at: null } as SelectionTask;
  expect(finishedWithoutDownloads({ ...task, outcomes: { already_acquired: 2, existing_job: 1 } })).toBe(true);
  expect(finishedWithoutDownloads({ ...task, total: 0 })).toBe(true);
  expect(finishedWithoutDownloads({ ...task, kind: "snapshot", processed: 0 })).toBe(true);
  expect(finishedWithoutDownloads(task)).toBe(false);
  expect(finishedWithoutDownloads({ ...task, outcomes: {} })).toBe(false);
  expect(finishedWithoutDownloads({ ...task, outcomes: { already_acquired: 2 } })).toBe(false);
  expect(finishedWithoutDownloads({ ...task, outcomes: { already_acquired: 2, download: 1 } })).toBe(false);
  expect(finishedWithoutDownloads({ ...task, outcomes: { already_acquired: 2, new_version: 1 } })).toBe(false);
  expect(finishedWithoutDownloads({ ...task, state: "failed", total: 0 })).toBe(false);
  expect(finishedWithoutDownloads({ ...task, state: "working", total: 0 })).toBe(false);
});

const changedBatch = (code = "selection_changed") =>
  ({
    id: "changed",
    kind: "batch",
    state: "failed",
    processed: 1,
    total: 3,
    request: { snapshot_id: "snapshot", destination_id: "library", recipe: "mp4" },
    issue: {
      code,
      message: "A selected release changed since enumeration. Create a new snapshot and review the new selection.",
      retryable: false,
      actions: [],
    },
    expires_at: null,
  }) as SelectionTask;

it("explains a source change in plain words with Refresh as the next step", () => {
  expect(checkIssue(changedBatch().issue)).toEqual({
    message: "A selected item changed on the source since it was listed. Refresh and try again.",
    refresh: true,
  });
  expect(checkIssue(changedBatch("source_changed").issue)?.refresh).toBe(true);
  expect(checkIssue({ code: "offline", message: "Source is offline", retryable: true, actions: [] })).toEqual({
    message: "Source is offline",
    refresh: false,
  });
  expect(checkIssue(null)).toBeNull();
});

it("offers Refresh in the check dialog instead of the engine's snapshot wording", async () => {
  dialogs();
  const onrefresh = vi.fn(async () => {});
  const onoptions = vi.fn();
  render(DownloadCheck, {
    props: {
      task: changedBatch(),
      onclose: () => {},
      onaction: async () => {},
      onreview: async () => {},
      onoptions,
      ondismiss: () => {},
      onrefresh,
    },
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "A selected item changed on the source since it was listed. Refresh and try again.",
  );
  expect(screen.queryByText(/enumeration|snapshot/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(onrefresh).toHaveBeenCalledOnce();
  expect(onoptions).not.toHaveBeenCalled();
});

it("keeps Check again for other unrecoverable check problems", () => {
  dialogs();
  render(DownloadCheck, {
    props: {
      task: { ...changedBatch(), issue: { code: "unsupported_operation", message: "Not supported", retryable: false, actions: [] } },
      onclose: () => {},
      onaction: async () => {},
      onreview: async () => {},
      onoptions: () => {},
      ondismiss: () => {},
      onrefresh: async () => {},
    },
  });
  expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
});

it("offers Refresh on an Activity row for a check whose items changed on the source", async () => {
  const onrefresh = vi.fn(async () => {});
  const onaction = vi.fn(async () => {});
  render(DownloadChecks, {
    props: {
      tasks: [changedBatch()],
      contexts: {},
      destinations: [],
      onchoose: async () => {},
      onaction,
      ondismiss: () => {},
      onrefresh,
    },
  });
  expect(screen.getByText("A selected item changed on the source since it was listed. Refresh and try again.")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(onrefresh).toHaveBeenCalledWith(expect.objectContaining({ id: "changed" }));
  expect(onaction).not.toHaveBeenCalled();
});

it("matches a refreshed selection against the fresh listing of its own collection", () => {
  const ref = (id: string) => ({ provider: "fixture", id });
  const listed = (id: string, extra: Record<string, unknown> = {}) => ({ reference: ref(id), availability: "available" as const, language: "en", group: null, ...extra });
  const policy = { languages: ["en"], groups: [] };
  // Listing order wins; duplicates and unselected releases are ignored.
  expect(reconcileSelection([ref("b"), ref("a")], [listed("a"), listed("x"), listed("b"), listed("a")], policy)).toEqual({ kept: [ref("a"), ref("b")], missing: 0, unavailable: 0 });
  expect(reconcileSelection([ref("a"), ref("gone")], [listed("a")], policy)).toEqual({ kept: [ref("a")], missing: 1, unavailable: 0 });
  // The engine's batch criteria: availability, then the policy's languages and groups.
  expect(reconcileSelection([ref("a"), ref("b"), ref("c"), ref("d")], [
    listed("a", { availability: "authentication_required" }),
    listed("b", { language: "fr" }),
    listed("c", { language: null }),
    listed("d"),
  ], { languages: ["en"], groups: ["team"] })).toEqual({ kept: [], missing: 0, unavailable: 4 });
  expect(reconcileSelection([ref("c")], [listed("c", { language: null, group: "team" })], { languages: ["en"], groups: ["team"] }).kept).toEqual([ref("c")]);
});

it("explains what Refresh left out of a selection", () => {
  const kept = (n: number) => Array.from({ length: n }, (_, i) => ({ provider: "fixture", id: String(i) }));
  expect(reconcileNotice("List", { kept: kept(2), missing: 0, unavailable: 0 })).toBeNull();
  expect(reconcileNotice("List", { kept: kept(3), missing: 2, unavailable: 0 })).toBe("2 selected items are no longer in List. They were left out; the other 3 items are being checked.");
  expect(reconcileNotice("List", { kept: kept(1), missing: 0, unavailable: 1 })).toBe("1 selected item can’t be downloaded from List right now. It was left out; the other item is being checked.");
  expect(reconcileNotice("List", { kept: [], missing: 1, unavailable: 2 })).toBe("1 selected item is no longer in List, and 2 can’t be downloaded right now. Nothing from this selection can be downloaded now. Open List to choose again.");
});
