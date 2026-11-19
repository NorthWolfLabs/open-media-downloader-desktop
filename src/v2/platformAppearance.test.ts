import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyVisualTheme, selectedVisualTheme, visualThemes, applyPlatform, detectPlatform, type Platform } from "./platform";
import { applyCustomTheme, emptyTheme, validateTheme } from "./theme";

// Vitest blanks CSS imports, so the shipped stylesheets are read from disk.
const tokens = readFileSync(resolve("src/v2/ui/tokens.css"), "utf8");
const foundation = readFileSync(resolve("src/v2/ui/foundation.css"), "utf8");
afterEach(() => {
  applyCustomTheme(null);
  delete document.documentElement.dataset.theme;
  document.head.querySelectorAll("style[data-test-sheet]").forEach((s) => s.remove());
});

type Block = { media: string; selector: string; values: Map<string, string> };
// Reads declarations through the DOM's own CSS parser (no regex snapshots).
function blocks(css: string): Block[] {
  const element = document.createElement("style");
  element.dataset.testSheet = "";
  element.textContent = css;
  document.head.append(element);
  const result: Block[] = [];
  const walk = (rules: CSSRuleList, media: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, rule.media.mediaText);
      else if (rule instanceof CSSStyleRule) {
        const values = new Map<string, string>();
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i];
          values.set(name, rule.style.getPropertyValue(name).trim());
        }
        result.push({ media, selector: rule.selectorText.replace(/\s+/g, " "), values });
      }
    }
  };
  walk(element.sheet!.cssRules, "");
  return result;
}
const sheet = blocks(tokens);
const find = (selector: string, media = "") => {
  const block = sheet.find((b) => b.media === media && b.selector.split(", ").includes(selector));
  expect(block, `${media} ${selector}`).toBeDefined();
  return block!.values;
};
const dark = "(prefers-color-scheme: dark)";
const platformSelector = (p: Platform) => `:root[data-appearance="${p}"]`;
// Mirrors the cascade: generic light, platform light, then generic and platform dark.
function palette(platform: Platform, appearance: "light" | "dark", explicit = false) {
  const merged = new Map(find(":root"));
  const own = platform === "linux" ? find(platformSelector("linux")) : find(platformSelector(platform));
  own.forEach((v, k) => merged.set(k, v));
  if (appearance === "dark") {
    const genericDark = explicit ? find(':root[data-theme="dark"]') : find(':root:not([data-theme="light"])', dark);
    genericDark.forEach((v, k) => merged.set(k, v));
    if (platform !== "linux") {
      const platformDark = explicit
        ? find(`${platformSelector(platform)}[data-theme="dark"]`)
        : find(`${platformSelector(platform)}:not([data-theme="light"])`, dark);
      platformDark.forEach((v, k) => merged.set(k, v));
    }
  }
  return merged;
}
function luminance(hex: string) {
  const v = hex.replace("#", "");
  expect(v, `${hex} must be an opaque six-digit color`).toMatch(/^[\da-f]{6}$/i);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
function hue(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

it("routes macOS, Windows and Linux WebViews to their own platform treatment", () => {
  expect(detectPlatform({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)" })).toBe("macos");
  expect(detectPlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0" })).toBe("windows");
  expect(detectPlatform({ platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)" })).toBe("linux");
  expect(detectPlatform({ platform: "", userAgent: "", userAgentData: { platform: "Windows" } })).toBe("windows");
  const root = document.createElement("html");
  applyPlatform(root, { platform: "Win32", userAgent: "" });
  expect(root.dataset.platform).toBe("windows");
  expect(root.dataset.appearance).toBe("windows");
});

it("starts each platform from its own system typeface instead of Inter", () => {
  const first = (platform: Platform) => palette(platform, "light").get("--font-ui")!.split(",")[0].trim();
  expect(first("macos")).toBe("-apple-system");
  expect(first("windows")).toBe('"Segoe UI Variable Text"');
  expect(palette("linux", "light").get("--font-ui")).toMatch(/Cantarell/);
  expect(find(":root").get("font-family")).toBe("var(--font-ui)");
  expect(tokens).not.toMatch(/\bInter\b/);
  expect(emptyTheme().font).toBe("system");
});

it("uses a restrained blue accent and readable text in every platform and appearance", () => {
  for (const platform of ["macos", "windows", "linux"] as const)
    for (const appearance of ["light", "dark"] as const) {
      const p = palette(platform, appearance);
      const at = `${platform} ${appearance}`;
      expect(hue(p.get("--accent")!), `${at} accent hue`).toBeGreaterThan(195);
      expect(hue(p.get("--accent")!), `${at} accent hue`).toBeLessThan(225);
      for (const surface of ["--bg", "--surface", "--sidebar-bg", "--surface-raised"]) {
        expect(contrast(p.get("--text")!, p.get(surface)!), `${at} text on ${surface}`).toBeGreaterThanOrEqual(7);
        expect(contrast(p.get("--muted")!, p.get(surface)!), `${at} secondary text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of ["--bg", "--surface"]) {
        expect(contrast(p.get("--accent-text")!, p.get(surface)!), `${at} accent text on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.get("--red")!, p.get(surface)!), `${at} error text on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(p.get("--accent-contrast")!, p.get("--accent")!), `${at} primary button text`).toBeGreaterThanOrEqual(4.5);
    }
});

it("keeps an explicit Light or Dark choice equal to the system appearance on each platform", () => {
  for (const platform of ["macos", "windows", "linux"] as const)
    expect(palette(platform, "dark", true)).toEqual(palette(platform, "dark"));
});

it("respects forced colors, increased contrast and reduced motion", () => {
  const rules = blocks(foundation);
  const media = new Set(rules.map((rule) => rule.media));
  expect([...media].some((m) => m.includes("forced-colors: active"))).toBe(true);
  expect([...media].some((m) => m.includes("prefers-contrast: more"))).toBe(true);
  const reduced = rules.find((rule) => rule.media.includes("prefers-reduced-motion: reduce") && rule.values.has("--motion-duration"));
  expect(reduced?.values.get("--motion-duration")).toBe("0ms");
  const forcedCheckbox = rules.find((rule) => rule.media.includes("forced-colors") && rule.selector.includes('input[type="checkbox"]'));
  expect(forcedCheckbox?.values.get("appearance")).toBe("auto");
});

it("keeps imported custom themes authoritative over the platform defaults", () => {
  const root = document.documentElement;
  // A theme from an earlier release only knows the original fields.
  applyCustomTheme(validateTheme({ version: 1, name: "Warm", base: "dark", font: "inter", values: { accent: "#f0a94b", surface: "#141815" } }));
  expect(root.dataset.theme).toBe("dark");
  expect(root.style.getPropertyValue("--accent")).toBe("#f0a94b");
  expect(root.style.getPropertyValue("--accent-text")).toBe("#f0a94b");
  expect(root.style.getPropertyValue("--accent-contrast")).toBe("#000000");
  expect(root.style.getPropertyValue("--sidebar-bg")).toBe("#141815");
  expect(root.style.fontFamily).toMatch(/^Inter/);
  // The system font follows the platform stack rather than a fixed list.
  applyCustomTheme(validateTheme({ version: 1, name: "Plain", base: "system", font: "system", values: {} }));
  expect(root.style.fontFamily).toBe("");
  expect(root.style.getPropertyValue("--accent-text")).toBe("");
});

it("switches design independently of the native platform and color mode",()=>{
 const root=document.createElement("html");root.dataset.platform="macos";root.dataset.theme="dark";
 for(const theme of visualThemes){applyVisualTheme(theme.id,root);expect(root.dataset.platform).toBe("macos");expect(root.dataset.theme).toBe("dark");}
 applyVisualTheme("windows",root);expect(root.dataset.appearance).toBe("windows");
 localStorage.setItem("omd.visual-theme","unknown");expect(selectedVisualTheme()).toBe("system");localStorage.removeItem("omd.visual-theme");
});

it("keeps named palette text readable in light and dark modes",()=>{
 for(const name of ["kde","tokyo-night"]) for(const mode of ["light","dark"]) {
  const values=find(`:root[data-visual-theme="${name}"]${mode==="dark"?'[data-theme="dark"]':''}`);
  for(const role of ["--text","--muted"]) for(const background of ["--bg","--surface"]) expect(contrast(values.get(role)!,values.get(background)!),`${name} ${mode} ${role}`).toBeGreaterThanOrEqual(4.5);
 }
});
