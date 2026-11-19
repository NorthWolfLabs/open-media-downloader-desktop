import { parse, stringify } from "smol-toml";
import { themeFields, type ThemeField } from "./themeCatalog";
export type Theme = {
  version: 1;
  name: string;
  base: "system" | "dark" | "light";
  font: "system" | "inter" | "serif" | "monospace";
  values: Record<string, string | number>;
};
export const themeKey = "omd.custom-theme.v1";
export const emptyTheme = (): Theme => ({
  version: 1,
  name: "My theme",
  base: "system",
  font: "system",
  values: {},
});
const fields = new Map(themeFields.map((field) => [field.key, field]));
function colorHex(value: string): string {
  if (/^#[\da-f]{3,8}$/i.test(value)) {
    const v = value.slice(1);
    if (v.length === 3 || v.length === 4)
      return "#" + [...v].map((c) => c + c).join("");
    if (v.length === 6 || v.length === 8) return value.toLowerCase();
  }
  const match =
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
      value,
    );
  if (match) {
    const rgba = match.slice(1, 4).map(Number);
    if (match[4] != null) rgba.push(Math.round(Number(match[4]) * 255));
    if (rgba.every((n) => Number.isFinite(n) && n >= 0 && n <= 255))
      return (
        "#" +
        rgba.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")
      );
  }
  throw new Error("Use a hex color, such as #f0a94b or #f0a94b80.");
}
export function validateTheme(input: unknown): Theme {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("This is not an OMD theme.");
  const t = input as Record<string, unknown>;
  if (
    Object.keys(t).some(
      (k) => !["version", "name", "base", "font", "values"].includes(k),
    )
  )
    throw new Error("The theme contains an unknown section.");
  if (t.version !== 1) throw new Error("This theme version is not supported.");
  if (typeof t.name !== "string" || !t.name.trim() || t.name.length > 100)
    throw new Error("Give the theme a name of up to 100 characters.");
  if (!["system", "dark", "light"].includes(String(t.base)))
    throw new Error("Choose a System, Dark, or Light base.");
  if (!["system", "inter", "serif", "monospace"].includes(String(t.font)))
    throw new Error("Choose a supported font.");
  if (!t.values || typeof t.values !== "object" || Array.isArray(t.values))
    throw new Error("The theme needs a values section.");
  const values: Theme["values"] = {};
  for (const [key, value] of Object.entries(t.values)) {
    const field = fields.get(key);
    if (!field) throw new Error(`Unknown theme setting: ${key}`);
    if (field.kind === "color") {
      if (typeof value !== "string")
        throw new Error(`${field.label} needs a color.`);
      values[key] = colorHex(value);
    } else {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < (field.min ?? 0) ||
        value > (field.max ?? 1000)
      )
        throw new Error(
          `${field.label} must be between ${field.min ?? 0} and ${field.max ?? 1000}.`,
        );
      values[key] = value;
    }
  }
  return {
    version: 1,
    name: t.name.trim(),
    base: t.base as Theme["base"],
    font: t.font as Theme["font"],
    values,
  };
}
export function parseTheme(text: string): Theme {
  if (new TextEncoder().encode(text).length > 262144)
    throw new Error("Choose a theme smaller than 256 KB.");
  return validateTheme(parse(text));
}
export function serializeTheme(theme: Theme): string {
  return (
    "# OMD theme — sizes are pixels unless the editor specifies another unit.\n" +
    stringify(validateTheme(theme))
  );
}
// Themes saved before a field existed set only the original colors. These
// newer roles follow the closest original value, so an imported theme keeps
// its look instead of mixing with the platform palette.
const derived: [target: string, source: string][] = [
  ["sidebar_bg", "surface"],
  ["button_bg", "surface_raised"],
  ["accent_text", "accent"],
  ["selection_bg", "accent_soft"],
];
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Black or white, whichever reads better on the given fill. */
function readableOn(fill: string): "#000000" | "#ffffff" {
  const l = luminance(colorHex(fill));
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}
export function applyCustomTheme(theme: Theme | null) {
  const t = theme ? validateTheme(theme) : null;
  const root = document.documentElement;
  for (const field of themeFields) root.style.removeProperty(field.css);
  root.style.removeProperty("--sidebar-backdrop");
  root.style.removeProperty("font-family");
  if (!t) {
    window.dispatchEvent(new Event("omd-theme-changed"));
    return;
  }
  if (t.base === "system") delete root.dataset.theme;
  else root.dataset.theme = t.base;
  const values = { ...t.values };
  for (const [target, source] of derived)
    if (values[target] == null && values[source] != null)
      values[target] = values[source];
  if (values.accent_contrast == null && typeof values.accent === "string")
    values.accent_contrast = readableOn(values.accent);
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key)!;
    root.style.setProperty(
      field.css,
      typeof value === "number" ? `${value}${field.unit ?? ""}` : value,
    );
  }
  // The unfocused-window sidebar (GNOME backdrop) keeps a theme's own sidebar
  // color instead of switching to the platform's.
  if (typeof values.sidebar_bg === "string")
    root.style.setProperty("--sidebar-backdrop", values.sidebar_bg);
  // "System font" follows the platform stack in tokens.css.
  if (t.font !== "system")
    root.style.setProperty(
      "font-family",
      {
        inter: "Inter, ui-sans-serif, sans-serif",
        serif: "Georgia, serif",
        monospace: "ui-monospace, SFMono-Regular, monospace",
      }[t.font],
    );
  window.dispatchEvent(new Event("omd-theme-changed"));
}
export function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(themeKey);
    return value ? validateTheme(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
export function restoreCustomTheme() {
  applyCustomTheme(savedTheme());
}
export function saveTheme(theme: Theme) {
  const valid = validateTheme(theme);
  localStorage.setItem(themeKey, JSON.stringify(valid));
  if (valid.base === "system") localStorage.removeItem("omd.theme");
  else localStorage.setItem("omd.theme", valid.base);
  applyCustomTheme(valid);
}
export function fieldValue(field: ThemeField, theme: Theme): string | number {
  if (theme.values[field.key] != null) return theme.values[field.key];
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(field.css)
    .trim();
  const number = parseFloat(value);
  return field.kind === "color"
    ? colorHex(value || String(field.fallback))
    : Number.isFinite(number)
      ? number
      : Number(field.fallback);
}
export function completeTheme(theme: Theme): Theme {
  return validateTheme({
    ...theme,
    values: Object.fromEntries(
      themeFields.map((f) => [f.key, fieldValue(f, theme)]),
    ),
  });
}
