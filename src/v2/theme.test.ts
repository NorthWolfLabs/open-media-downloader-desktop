import { afterEach, expect, it } from "vitest";
import {
  applyCustomTheme,
  emptyTheme,
  parseTheme,
  serializeTheme,
  saveTheme,
  restoreCustomTheme,
  themeKey,
  completeTheme,
} from "./theme";
import { themeFields } from "./themeCatalog";
afterEach(() => {
  applyCustomTheme(null);
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
it("round trips a named theme with colors, type, geometry and component overrides", () => {
  const component = themeFields.find(
    (f) => f.group === "Result browser" && f.kind === "number",
  )!;
  const theme = {
    ...emptyTheme(),
    name: "Warm reading",
    base: "dark" as const,
    values: {
      accent: "#f0a94b",
      type_body: 17,
      control_radius: 11,
      [component.key]: component.fallback,
    },
  };
  expect(parseTheme(serializeTheme(theme))).toEqual(theme);
  saveTheme(theme);
  document.documentElement.style.removeProperty("--accent");
  restoreCustomTheme();
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#f0a94b",
  );
  expect(document.documentElement.style.getPropertyValue("--type-body")).toBe(
    "17px",
  );
  expect(document.documentElement.style.getPropertyValue(component.css)).toBe(
    `${component.fallback}${component.unit}`,
  );
});
it("rejects invalid files without replacing the current theme", () => {
  saveTheme({ ...emptyTheme(), values: { accent: "#abcdef" } });
  const prior = localStorage.getItem(themeKey);
  for (const input of [
    'version=2\nname="New"\nbase="dark"\nfont="system"\n[values]',
    serializeTheme(emptyTheme()) + "\nunknown = 3",
    serializeTheme(emptyTheme()) + '\naccent = "url(https://example.org/a)"',
    serializeTheme(emptyTheme()) + "\ncontrol_height = 0",
    "x".repeat(262145),
  ])
    expect(() => parseTheme(input)).toThrow();
  expect(localStorage.getItem(themeKey)).toBe(prior);
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#abcdef",
  );
});
it("can clear an applied theme and restore built-in values", () => {
  saveTheme({
    ...emptyTheme(),
    values: { accent: "#fff8", control_radius: 0 },
  });
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#ffffff88",
  );
  applyCustomTheme(null);
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe("");
  expect(new Set(themeFields.map((f) => f.key)).size).toBe(themeFields.length);
  expect(new Set(themeFields.map((f) => f.css)).size).toBe(themeFields.length);
});

it("exports every default field within its unit-specific bounds", () => {
  const theme = completeTheme(emptyTheme());
  expect(Object.keys(theme.values)).toHaveLength(themeFields.length);
  expect(parseTheme(serializeTheme(theme))).toEqual(theme);
});
