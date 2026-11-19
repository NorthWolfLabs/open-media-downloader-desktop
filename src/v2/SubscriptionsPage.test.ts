import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/svelte";
import SubscriptionsPage from "./SubscriptionsPage.svelte";
afterEach(cleanup);
it("keeps 1000 subscriptions bounded, searches all records and opens/removes a subscription", async () => {
  let items = Array.from({ length: 1000 }, (_, i) => ({
    id: `s${i}`,
    title: `Series ${String(i).padStart(4, "0")}`,
    enabled: i % 2 === 0,
    request: {
      target: { provider: "p", id: `title${i}` },
      action: "notify",
      interval_minutes: 60,
    },
    last_success: null,
    next_check: null,
  }));
  const request = vi.fn(async (route: string) => {
    if (route.endsWith("/unsubscribe"))
      items = items.filter(
        (s) => route !== `/v2/subscriptions/${s.id}/unsubscribe`,
      );
  });
  const onopen = vi.fn(),
    onchange = vi.fn(async () => {
      await mounted.rerender({ items: items as any });
    });
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    configurable: true,
    value: function () {},
  });
  Object.defineProperty(HTMLElement.prototype, "hidePopover", {
    configurable: true,
    value: function () {},
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.open = false;
    },
  });
  const mounted = render(SubscriptionsPage, {
    onfocus: vi.fn(),
    client: { listAll: async () => items, request } as any,
    items: items as any,
    sources: { p: "Example source" },
    onopen,
    onsettings: vi.fn(),
    onchange,
  });
  await screen.findByText("1000 subscriptions");
  expect(
    screen.getAllByRole("button", { name: /^Manage Series/ }),
  ).toHaveLength(50);
  await fireEvent.input(
    screen.getByRole("searchbox", { name: "Search subscriptions" }),
    { target: { value: "0999" } },
  );
  await screen.findByText("1 subscription");
  await fireEvent.click(screen.getByRole("button", { name: /^Series 0999/ }));
  expect(onopen).toHaveBeenCalledWith(
    expect.objectContaining({ reference: { provider: "p", id: "title999" } }),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Manage Series 0999" }),
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Subscription settings" }),
  );
  expect(screen.getByRole("button", { name: "Resume updates" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Unsubscribe…" }));
  expect(request).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
  await waitFor(() => expect(onchange).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith("/v2/subscriptions/s999/unsubscribe", {
    method: "POST",
  });
  await screen.findByText("No matching subscriptions");
});
it("shows a subscription's problem in the list and resumes it in place", async () => {
  const request = vi.fn(async () => undefined);
  const onchange = vi.fn(async () => {});
  render(SubscriptionsPage, {
    client: { request } as any,
    items: [{ id: "s1", title: "Harbor Picture Book", enabled: false, issue: { code: "x", message: "Paused after three failed checks.", retryable: true, actions: [] }, request: { target: { provider: "p", id: "t" }, action: "download", interval_minutes: 60 }, last_success: null, next_check: null }] as any,
    sources: { p: "Lantern Archive" }, onopen: vi.fn(), onsettings: vi.fn(), onfocus: vi.fn(), onchange,
  });
  expect(screen.getByText("Paused after three failed checks.")).toBeTruthy();
  expect(screen.getByText("Needs attention")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(request).toHaveBeenCalledWith("/v2/subscriptions/s1/resume", { method: "POST" });
  await waitFor(() => expect(onchange).toHaveBeenCalled());
});
