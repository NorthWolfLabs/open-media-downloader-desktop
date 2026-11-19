import { reusableCheck, type SelectionTask } from "./downloadReview";
import { it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import { reviewCounts, type Preparation } from "./downloadReview";
import DownloadReview from "./DownloadReview.svelte";
import DownloadCheck from "./DownloadCheck.svelte";
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
