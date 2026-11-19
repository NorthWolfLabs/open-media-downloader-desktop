import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import AppearanceSettings from "./AppearanceSettings.svelte";
import { applyCustomTheme, savedTheme } from "./theme";
beforeEach(() => {
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
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  applyCustomTheme(null);
});
it("previews colors, cancels without saving, and applies an edited theme explicitly", async () => {
  render(AppearanceSettings, {
    mode: "dark",
    native: false,
    onchange: vi.fn(),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Customize" }));
  await fireEvent.change(screen.getByLabelText("Accent", { exact: true }), {
    target: { value: "#ff0000" },
  });
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#ff0000",
  );
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
  expect(savedTheme()).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Customize" }));
  await fireEvent.change(screen.getByLabelText("Accent", { exact: true }), {
    target: { value: "#aabbcc" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Apply theme" }));
  expect(savedTheme()?.values.accent).toBe("#aabbcc");
});

it("offers named themes separately from color mode without changing native identity",async()=>{
 document.documentElement.dataset.platform="macos";
 render(AppearanceSettings,{mode:"dark",native:false,onchange:vi.fn()});
 await fireEvent.click(screen.getByRole("button",{name:"Theme: Follow platform"}));
 await fireEvent.click(screen.getByRole("button",{name:"Windows · Fluent"}));
 expect(document.documentElement.dataset.platform).toBe("macos");
 expect(document.documentElement.dataset.appearance).toBe("windows");
 expect(localStorage.getItem("omd.visual-theme")).toBe("windows");
 expect(screen.getByRole("button",{name:"Color mode: Dark"})).toBeTruthy();
});
