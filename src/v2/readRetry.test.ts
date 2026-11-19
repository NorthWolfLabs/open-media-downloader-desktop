import { afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/svelte";
import { ReadRetry, isTransientSourceError } from "./readRetry";
import Discovery from "./DiscoveryHarness.svelte";
import { discoveryState } from "./discoveryState";
import type { EngineClient, Collection, ProviderManifest } from "./client";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
it("bounds retry attempts and backs off rather than repeatedly flooding a source", async () => {
  vi.useFakeTimers();
  const retry = new ReadRetry();
  const task = vi.fn(() => {
    retry.schedule("source", task);
  });
  expect(retry.schedule("source", task)).toBe(true);
  retry.schedule("source", task);
  await vi.advanceTimersByTimeAsync(1999);
  expect(task).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(task).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(task).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(task).toHaveBeenCalledTimes(3);
  expect(retry.schedule("source", task)).toBe(false);
  await vi.advanceTimersByTimeAsync(60000);
  expect(task).toHaveBeenCalledTimes(3);
});
it("pauses while away, resumes pending work, and cancels it when the search is replaced", async () => {
  vi.useFakeTimers();
  const retry = new ReadRetry();
  const task = vi.fn();
  retry.schedule("source", task);
  retry.pause(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(task).not.toHaveBeenCalled();
  retry.pause(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(task).toHaveBeenCalledOnce();
  retry.schedule("source", task);
  retry.clear();
  await vi.advanceTimersByTimeAsync(60000);
  expect(task).toHaveBeenCalledOnce();
});
it("honors explicitly nonretryable source failures", () => {
  expect(
    isTransientSourceError(
      new Error("The source request timed out or could not connect"),
    ),
  ).toBe(true);
  expect(
    isTransientSourceError({ problem: { retryable: false }, status: 503 }),
  ).toBe(false);
  expect(
    isTransientSourceError(
      new Error(
        "The source repeated a results page. Update the source and retry.",
      ),
    ),
  ).toBe(false);
});
it("toasts a failed continuation and retries its same cursor without removing existing results", async () => {
  vi.useFakeTimers();
  const item = (id: string): Collection => ({
    reference: { provider: "source", id },
    title: id,
    kind: "manga",
    summary: {},
    canonical_url: `https://example.org/${id}`,
    artwork_url: null,
  });
  let calls = 0;
  const operation = vi.fn(async (_id: string, input: any) => {
    if (input.operation !== "browse") return item("unused");
    if (++calls === 1)
      throw new Error("The source request timed out or could not connect");
    return { items: [item("New result")], next_cursor: null };
  });
  const state = discoveryState();
  state.selected = ["source"];
  state.results = [item("Existing result")];
  state.searched = true;
  state.editing = false;
  state.cursors = { source: "next-page" };
  state.applied = {
    source: {
      operation: "browse",
      query: "original",
      credential_profile: "account-a",
      page_size: 60,
    },
  };
  render(Discovery, {
    client: { operation } as unknown as EngineClient,
    state,
    sources: [
      {
        manifest: {
          id: "source",
          name: "Source",
          version: "1",
          api: "omd:provider@2.0.0",
          description: "Fixture",
          source_hosts: ["example.org"],
          capabilities: ["browse"],
          grants: [],
        } as ProviderManifest,
      },
    ],
    accounts: { source: "account-a" },
    languages: "en",
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(
    screen.getByText(/Retrying automatically/).closest(".toast"),
  ).toBeTruthy();
  expect(document.querySelector(".v2-alert")).toBeNull();
  expect(screen.getByRole("button", { name: "Existing result" })).toBeTruthy();
  await vi.advanceTimersByTimeAsync(2000);
  expect(screen.getByRole("button", { name: "Existing result" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "New result" })).toBeTruthy();
  const reads = operation.mock.calls.filter(
    ([, input]) => input.operation === "browse",
  );
  expect(reads).toHaveLength(2);
  expect(
    reads.every(
      ([, input]) =>
        input.cursor === "next-page" &&
        input.query === "original" &&
        input.credential_profile === "account-a",
    ),
  ).toBe(true);
  expect(screen.queryByText(/Retrying automatically/)).toBeNull();
});
