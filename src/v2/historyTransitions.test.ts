import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import History from "./History.svelte";
const jobs = [
  {
    id: "one",
    title: "Chapter one",
    updated_at: "2026-09-08",
    plan: {
      collection: {
        title: "Saved series",
        reference: { provider: "p", id: "series" },
      },
    },
  },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const props = (client: any, revision = 0) => ({
  client,
  revision,
  sources: { p: "Source" },
  onfocus: vi.fn(),
  onfiles: vi.fn(),
  onremove: vi.fn(),
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("never claims history is empty before the first response and shows fast results without loading copy", async () => {
  vi.useFakeTimers();
  const result = deferred<any[]>();
  render(History, props({ listAll: () => result.promise }));
  expect(screen.queryByText("No download history")).toBeNull();
  await vi.advanceTimersByTimeAsync(100);
  expect(screen.queryByText("Loading history…")).toBeNull();
  result.resolve(jobs);
  await vi.advanceTimersByTimeAsync(0);
  expect(screen.getByText("Saved series")).toBeTruthy();
  expect(screen.queryByText("Loading history…")).toBeNull();
});
it("shows the genuine result immediately when slow loading finishes", async () => {
  vi.useFakeTimers();
  const result = deferred<any[]>();
  render(History, props({ listAll: () => result.promise }));
  await vi.advanceTimersByTimeAsync(301);
  expect(screen.getByText("Loading history…")).toBeTruthy();
  result.resolve([]);
  await vi.advanceTimersByTimeAsync(0);
  expect(screen.getByText("No download history")).toBeTruthy();
});
it("reuses settled history immediately and retains it during event refreshes and failures", async () => {
  const listAll = vi.fn().mockResolvedValueOnce(jobs);
  const client = { listAll };
  const first = render(History, props(client));
  await screen.findByText("Saved series");
  first.unmount();
  const next = render(History, props(client));
  expect(screen.getByText("Saved series")).toBeTruthy();
  await tick();
  expect(listAll).toHaveBeenCalledOnce();
  const result = deferred<any[]>();
  listAll.mockReturnValueOnce(result.promise);
  await next.rerender({ revision: 1 });
  expect(screen.getByText("Saved series")).toBeTruthy();
  result.reject(new Error("Temporarily offline"));
  await screen.findByRole("alert");
  expect(screen.getByText("Saved series")).toBeTruthy();
  expect(screen.queryByText("No download history")).toBeNull();
  listAll.mockResolvedValueOnce([]);
  await next.rerender({ revision: 2 });
  await waitFor(() =>
    expect(screen.getByText("No download history")).toBeTruthy(),
  );
});
it("ignores an older refresh that resolves after a newer engine event", async () => {
  const first = deferred<any[]>(),
    second = deferred<any[]>();
  const listAll = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const view = render(History, props({ listAll }));
  await view.rerender({ revision: 1 });
  second.resolve(jobs);
  await screen.findByText("Saved series");
  first.resolve([]);
  await tick();
  expect(screen.getByText("Saved series")).toBeTruthy();
  expect(screen.queryByText("No download history")).toBeNull();
});
