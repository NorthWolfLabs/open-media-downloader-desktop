import { expect, it, vi } from "vitest";
import {
  activeReleaseKeys,
  matchesBulkSelection,
  referenceKey,
  releaseStatuses,
} from "./releaseSelection";
import type { EngineClient, Release } from "./client";

it("distinguishes missing media from unavailable storage and unknown status", () => {
  const reference = { provider: "source", id: "release" };
  const release = { reference, availability: "available" } as Release;
  for (const state of [
    "missing",
    "partial",
    "present",
    "modified",
    "destination_unavailable",
    "unavailable",
    "detached",
    null,
  ]) {
    const statuses = {
      [referenceKey(reference)]: {
        reference,
        acquired_versions: 1,
        last_acquired_at: null,
        file_state: state,
      },
    };
    expect(
      matchesBulkSelection(release, "not_downloaded", statuses, new Set()),
    ).toBe(false);
    expect(
      matchesBulkSelection(release, "missing_files", statuses, new Set()),
    ).toBe(state === "missing" || state === "partial");
    expect(
      matchesBulkSelection(
        release,
        "all",
        statuses,
        new Set([referenceKey(reference)]),
      ),
    ).toBe(false);
  }
  expect(matchesBulkSelection(release, "missing_files", {}, new Set())).toBe(
    false,
  );
});

it("looks up the complete selection in bounded unique status batches", async () => {
  const references = Array.from({ length: 405 }, (_, id) => ({
    provider: "source",
    id: String(id),
  }));
  const request = vi.fn(async (_route, options) =>
    options.body.references.map((reference: any) => ({
      reference,
      acquired_versions: 0,
    })),
  );
  const result = await releaseStatuses({ request } as unknown as EngineClient, [
    ...references,
    references[0],
  ]);
  expect(request.mock.calls.map(([, o]) => o.body.references.length)).toEqual([
    200, 200, 5,
  ]);
  expect(Object.keys(result)).toHaveLength(405);
});

it("rejects incomplete status responses instead of assuming unknown items are new", async () => {
  const client = { request: async () => [] } as unknown as EngineClient;
  await expect(
    releaseStatuses(client, [{ provider: "source", id: "release" }]),
  ).rejects.toThrow("every selected item");
});

it("keeps active and paused jobs out of selection using the complete job listing", async () => {
  const job = (id: string, state: string) => ({
    state,
    plan: { release: { reference: { provider: "source", id } } },
  });
  const listAll = vi.fn(async () => [
    job("queued", "queued"),
    job("paused", "paused"),
    job("done", "completed"),
  ]);
  const result = await activeReleaseKeys({
    listAll,
  } as unknown as EngineClient);
  expect(listAll).toHaveBeenCalledWith("/v2/jobs?state=active");
  expect([...result]).toEqual([
    referenceKey({ provider: "source", id: "queued" }),
    referenceKey({ provider: "source", id: "paused" }),
  ]);
});
