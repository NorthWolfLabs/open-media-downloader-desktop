import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import AnotherFormatDialog from "./AnotherFormatDialog.svelte";
import { formatChoice } from "./jobIssue";
afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
});

const choice = () =>
  formatChoice(
    {
      title: "Episode 1",
      reference: { provider: "p", id: "r1" },
      destination_id: "d1",
      policy: { max_height: 1080 },
      recipe: "mp4",
    },
    { media: true, audio: false },
  );

it("names the failed format, offers the item's formats and opens the review", async () => {
  const onreview = vi.fn(async () => {});
  render(AnotherFormatDialog, { choice: choice(), onclose: vi.fn(), onreview });
  expect(screen.getByRole("heading", { name: "Choose another format" })).toBeTruthy();
  expect(screen.getByText("Episode 1")).toBeTruthy();
  expect(screen.getByText(/Trying the MP4 video download again would give the same/)).toBeTruthy();
  // The video choices and resolution are shown for a video item.
  expect(screen.getByText("Save as")).toBeTruthy();
  expect(screen.getByText("Maximum resolution")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Review download" }));
  expect(onreview).toHaveBeenCalledOnce();
});

it("disables the review while busy", () => {
  render(AnotherFormatDialog, { choice: choice(), busy: true, onclose: vi.fn(), onreview: vi.fn(async () => {}) });
  expect((screen.getByRole("button", { name: "Review download" }) as HTMLButtonElement).disabled).toBe(true);
});
