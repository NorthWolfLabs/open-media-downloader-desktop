import { afterEach, it, expect } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import LanguagePicker from "./LanguagePicker.svelte";
afterEach(cleanup);
it("lets users choose language names and distinguishes no subtitles from any language", async () => {
  render(LanguagePicker, { value: "", label: "Subtitles", emptyLabel: "None" });
  expect(screen.getByRole("button", { name: "Subtitles: None" })).toBeTruthy();
  await fireEvent.click(
    screen.getByRole("button", { name: "Subtitles: None" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(
    screen.getByRole("button", { name: "Subtitles: English" }),
  ).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("button", { name: "Subtitles: None" })).toBeTruthy();
});
