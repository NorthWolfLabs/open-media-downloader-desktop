import { afterEach, expect, test } from "vitest";
import { createRawSnippet } from "svelte";
import { render, screen } from "@testing-library/svelte";
import SavedFiles from "./SavedFiles.svelte";
import { displayJoinedPath, displayPath } from "./paths";
import type { Artifact, Job } from "./client";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("Windows paths use backslashes throughout", () => {
  expect(
    displayJoinedPath(
      "C:\\Users\\Sam\\Downloads\\OMD",
      "Harbor Show/Episode 1/audio.mp3",
      "windows",
    ),
  ).toBe("C:\\Users\\Sam\\Downloads\\OMD\\Harbor Show\\Episode 1\\audio.mp3");
  expect(displayPath("C:/Users/Sam/file.txt", "windows")).toBe(
    "C:\\Users\\Sam\\file.txt",
  );
});

test("a root ending in a separator does not double it", () => {
  expect(displayJoinedPath("D:\\", "Show/a.mp3", "windows")).toBe(
    "D:\\Show\\a.mp3",
  );
  expect(displayJoinedPath("D:\\Media\\", "a.mp3", "windows")).toBe(
    "D:\\Media\\a.mp3",
  );
});

test("UNC and extended-length prefixes are kept", () => {
  expect(displayJoinedPath("\\\\nas\\media", "Show/a.mp3", "windows")).toBe(
    "\\\\nas\\media\\Show\\a.mp3",
  );
  expect(displayJoinedPath("\\\\?\\C:\\Media", "Show/a.mp3", "windows")).toBe(
    "\\\\?\\C:\\Media\\Show\\a.mp3",
  );
});

test("macOS and Linux paths are unchanged, including backslashes in names", () => {
  for (const platform of ["macos", "linux", undefined]) {
    expect(displayJoinedPath("/home/sam/OMD", "Show/a\\b.mp3", platform)).toBe(
      "/home/sam/OMD/Show/a\\b.mp3",
    );
  }
});

test("the platform defaults to the detected operating system", () => {
  document.documentElement.dataset.platform = "windows";
  expect(displayPath("C:\\OMD/a.mp3")).toBe("C:\\OMD\\a.mp3");
  document.documentElement.dataset.platform = "linux";
  expect(displayPath("/srv/OMD/a.mp3")).toBe("/srv/OMD/a.mp3");
});

const job = {
  id: "job-1",
  title: "Episode 1",
  updated_at: "2026-11-01T10:00:00Z",
  plan: {
    collection: { title: "Harbor Show" },
    release: { canonical_url: "omd:fixture", revision: null },
  },
} as unknown as Job;
const file = {
  id: "artifact-1",
  relative_path: "Harbor Show/Episode 1/audio.mp3",
  size: 1024,
  status: "present",
} as unknown as Artifact;
const realPath = "C:\\Users\\Sam\\OMD/Harbor Show/Episode 1/audio.mp3";

test("Download details show a native Windows path but copy and reveal use the real one", async () => {
  document.documentElement.dataset.platform = "windows";
  const copied: Artifact[] = [];
  const opened: [Artifact, boolean][] = [];
  render(SavedFiles, {
    job,
    source: "Fixture",
    files: [file],
    native: true,
    cursor: null,
    path: () => realPath,
    onopen: (f: Artifact, reveal: boolean) => opened.push([f, reveal]),
    oncopy: (f: Artifact) => copied.push(f),
    onmore: async () => {},
    management: createRawSnippet(() => ({ render: () => "<span></span>" })),
  });
  const shown = "C:\\Users\\Sam\\OMD\\Harbor Show\\Episode 1\\audio.mp3";
  const line = screen.getByText(shown);
  expect(line.getAttribute("title")).toBe(shown);
  screen.getByRole("button", { name: "Copy path" }).click();
  screen.getByRole("button", { name: "Reveal folder" }).click();
  // The handlers receive the engine artifact; App copies its real joined path and
  // reveals by job and artifact id, so display normalization cannot reach them.
  expect(copied).toEqual([file]);
  expect(opened).toEqual([[file, true]]);
});
