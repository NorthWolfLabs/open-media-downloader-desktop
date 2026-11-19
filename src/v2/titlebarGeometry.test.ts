import { expect, it } from "vitest";
import { titlebarGeometry } from "./titlebarGeometry";
it("uses the actual heading center and themed toggle bounds across header layouts", () => {
  for (const [top, height, left, width] of [
    [24, 36, 96, 32],
    [24, 48, 96, 48],
    [16, 32, 96, 32],
  ]) {
    const element = document.createElement("span");
    const heading = document.createElement("h1");
    element.append(heading);
    heading.getBoundingClientRect = () => ({ top, height }) as DOMRect;
    const toggle = document.createElement("button");
    toggle.getBoundingClientRect = () =>
      ({ left, right: left + width }) as DOMRect;
    expect(titlebarGeometry(element, toggle)).toEqual({
      centerY: top + height / 2,
      toggleStart: left,
      toggleEnd: left + width,
    });
  }
});
it("aligns detail pages with their back button when there is no heading", () => {
  const element = document.createElement("span");
  element.innerHTML = '<button class="back-button"></button>';
  element.firstElementChild!.getBoundingClientRect = () =>
    ({ top: 24, height: 36 }) as DOMRect;
  expect(titlebarGeometry(element, null).centerY).toBe(42);
});
