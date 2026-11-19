import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/svelte";
import PendingStatus from "./ui/PendingStatus.svelte";
import { createRawSnippet } from "svelte";
import { PendingPresentation } from "./ui/pendingPresentation";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("never mounts feedback for fast operations, including consecutive ones", async () => {
  vi.useFakeTimers();
  const view = render(PendingStatus, { active: true, label: "Working…" });
  const seen: string[] = [];
  const observer = new MutationObserver(() =>
    seen.push(document.body.textContent ?? ""),
  );
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  for (let i = 0; i < 5; i++) {
    await view.rerender({ active: true });
    await vi.advanceTimersByTimeAsync(100);
    await view.rerender({ active: false });
    await vi.advanceTimersByTimeAsync(100);
  }
  await vi.advanceTimersByTimeAsync(1000);
  expect(screen.queryByRole("status")).toBeNull();
  expect(seen.some((text) => text.includes("Working…"))).toBe(false);
  observer.disconnect();
});
it("delays slow feedback and keeps it readable when the operation completes just after appearing", async () => {
  vi.useFakeTimers();
  const view = render(PendingStatus, { active: true, label: "Working…" });
  await vi.advanceTimersByTimeAsync(299);
  expect(screen.queryByRole("status")).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(screen.getByRole("status").textContent).toBe("Working…");
  await view.rerender({ active: false });
  await vi.advanceTimersByTimeAsync(699);
  expect(screen.getByRole("status")).toBeTruthy();
  await vi.advanceTimersByTimeAsync(1);
  expect(screen.queryByRole("status")).toBeNull();
});
it("keeps consecutive slow work stable and cancels timers on unmount", async () => {
  vi.useFakeTimers();
  const publish = vi.fn();
  const state = new PendingPresentation(publish);
  state.update("First");
  await vi.advanceTimersByTimeAsync(300);
  state.update("");
  await vi.advanceTimersByTimeAsync(200);
  state.update("Second");
  await vi.advanceTimersByTimeAsync(1000);
  expect(publish.mock.calls).toEqual([["First"], ["Second"]]);
  state.update("");
  state.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  expect(publish).toHaveBeenCalledTimes(2);
  const view = render(PendingStatus, { active: true, label: "Abandoned" });
  view.unmount();
  await vi.advanceTimersByTimeAsync(1000);
  expect(screen.queryByText("Abandoned")).toBeNull();
});

it("reveals completed content immediately even when the loading label has just appeared",async()=>{
 vi.useFakeTimers();const children=createRawSnippet(()=>({render:()=>'<p>Ready content</p>'}));
 const view=render(PendingStatus,{active:true,label:'Loading…',children});await vi.advanceTimersByTimeAsync(300);expect(screen.getByText('Loading…')).toBeTruthy();
 await view.rerender({active:false});expect(screen.getByText('Ready content')).toBeTruthy();expect(screen.queryByText('Loading…')).toBeNull();
});
