// Sidebar selection across platform, appearance, native window activation,
// hover, keyboard focus, accessibility media and imported themes. Vitest blanks
// CSS imports, so the shipped stylesheets are read from disk and cascaded here:
// the DOM's own parser and selector engine, CSS specificity, !important and
// inline theme properties, custom-property inheritance and var()/color-mix().
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyCustomTheme, validateTheme, type Theme } from "./theme";

type Platform = "macos" | "windows" | "linux";
type Env = { dark: boolean; contrastMore?: boolean; forced?: boolean; reducedMotion?: boolean };
type Declaration = { property: string; value: string; important: boolean };
type Rule = { selectors: string[]; media: string; declarations: Declaration[]; order: number };

// Load order in main.ts.
const files = ["src/v2/ui/tokens.css", "src/v2/ui/foundation.css", "src/v2/style.css"];
const css = files.map((file) => readFileSync(resolve(file), "utf8")).join("\n");

function splitTopLevel(text: string, separator: string) {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i).trim());
      start = i + separator.length;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}
const rules: Rule[] = (() => {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const out: Rule[] = [];
  const walk = (list: CSSRuleList, media: string) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules, media ? `${media} and ${rule.media.mediaText}` : rule.media.mediaText);
      else if (rule instanceof CSSStyleRule) {
        const declarations: Declaration[] = [];
        for (let i = 0; i < rule.style.length; i++) {
          const property = rule.style[i];
          declarations.push({ property, value: rule.style.getPropertyValue(property).trim(), important: rule.style.getPropertyPriority(property) === "important" });
        }
        out.push({ selectors: splitTopLevel(rule.selectorText, ","), media, declarations, order: out.length });
      }
      // @container and @keyframes never style the sidebar.
    }
  };
  walk(style.sheet!.cssRules, "");
  style.remove();
  return out;
})();

function mediaMatches(media: string, env: Env) {
  if (!media) return true;
  return media.split(/\s+and\s+/).every((query) => {
    const m = /^\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)$/.exec(query.trim());
    if (!m) throw new Error(`Unsupported media query ${media}`);
    const [, feature, value] = m;
    switch (feature) {
      case "prefers-color-scheme": return (value === "dark") === env.dark;
      case "prefers-contrast": return value === "more" && !!env.contrastMore;
      case "forced-colors": return value === "active" && !!env.forced;
      case "prefers-reduced-motion": return value === "reduce" && !!env.reducedMotion;
      case "max-width": return 1340 <= parseFloat(value);
      case "max-height": return 860 <= parseFloat(value);
      default: throw new Error(`Unsupported media feature ${feature}`);
    }
  });
}

// [a, b, c] specificity of one complex selector.
function specificity(selector: string): [number, number, number] {
  const total: [number, number, number] = [0, 0, 0];
  const add = (s: [number, number, number]) => s.forEach((n, i) => (total[i] += n));
  let i = 0;
  while (i < selector.length) {
    const c = selector[i];
    if (c === "#") { total[0]++; i++; while (/[\w-]/.test(selector[i] ?? "")) i++; }
    else if (c === ".") { total[1]++; i++; while (/[\w-]/.test(selector[i] ?? "")) i++; }
    else if (c === "[") { total[1]++; i = selector.indexOf("]", i) + 1; }
    else if (c === ":") {
      const element = selector[i + 1] === ":";
      i += element ? 2 : 1;
      const name = /^[\w-]+/.exec(selector.slice(i))![0];
      i += name.length;
      let args = "";
      if (selector[i] === "(") {
        let depth = 0, j = i;
        for (; j < selector.length; j++) { if (selector[j] === "(") depth++; else if (selector[j] === ")" && --depth === 0) break; }
        args = selector.slice(i + 1, j);
        i = j + 1;
      }
      if (element) total[2]++;
      else if (["not", "is", "has"].includes(name))
        add(splitTopLevel(args, ",").map(specificity).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0]);
      else if (name !== "where") total[1]++;
    } else if (/[a-zA-Z]/.test(c)) { total[2]++; while (/[\w-]/.test(selector[i] ?? "")) i++; }
    else i++;
  }
  return total;
}

type State = { hover?: boolean; focusVisible?: boolean };
// Interaction pseudo-classes become marker classes of equal specificity.
const markers = (selector: string) => selector.replace(/:hover\b/g, ".__hover").replace(/:focus-visible\b/g, ".__focus").replace(/:active(?![\w-])/g, ".__pressed");
function cascade(element: Element, env: Env, pseudo?: "before") {
  const winners = new Map<string, { value: string; rank: number[] }>();
  for (const rule of rules) {
    if (!mediaMatches(rule.media, env)) continue;
    // A rule applies with the highest specificity among its matching selectors.
    let best: number[] | null = null;
    for (const selector of rule.selectors) {
      const isBefore = /::before$/.test(selector);
      if ((pseudo === "before") !== isBefore) continue;
      const plain = selector.replace(/::before$/, "");
      if (plain.includes("::")) continue;
      let matched = false;
      try { matched = element.matches(markers(plain)); }
      catch { continue; } // :has() and similar never apply to these fixtures
      if (matched && (!best || compare(specificity(selector), best) > 0)) best = specificity(selector);
    }
    if (!best) continue;
    for (const d of rule.declarations) {
      const property = d.property === "background-color" ? "background" : d.property;
      // [important, inline, a, b, c, source order]
      const rank = [d.important ? 1 : 0, 0, ...best, rule.order];
      const current = winners.get(property);
      if (!current || compare(rank, current.rank) >= 0) winners.set(property, { value: d.value, rank });
    }
  }
  // Inline properties (imported themes on the root) beat normal declarations.
  if (!pseudo && element instanceof HTMLElement)
    for (let i = 0; i < element.style.length; i++) {
      const property = element.style[i];
      const current = winners.get(property);
      if (!current || current.rank[0] === 0) winners.set(property, { value: element.style.getPropertyValue(property), rank: [0, 1] });
    }
  return new Map([...winners].map(([k, v]) => [k, v.value]));
}
const compare = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0); return 0; };

type Computed = { vars: Map<string, string>; color: string; background: string; border: string; outline: string; other: Map<string, string> };
const computedCache = new Map<Element, Computed>();
function computed(element: Element, env: Env, pseudo?: "before"): Computed {
  if (!pseudo && computedCache.has(element)) return computedCache.get(element)!;
  const parent = pseudo ? computed(element, env) : element.parentElement ? computed(element.parentElement, env) : null;
  const own = cascade(element, env, pseudo);
  const vars = new Map(parent?.vars ?? []);
  for (const [k, v] of own) if (k.startsWith("--")) vars.set(k, v);
  const value = (raw: string): string => resolveValue(raw, vars);
  const parentColor = parent?.color ?? "#000000";
  let color = own.has("color") ? value(own.get("color")!) : parentColor;
  if (color === "inherit" || color === "currentcolor") color = parentColor;
  const bg = own.has("background") ? value(own.get("background")!) : "transparent";
  const borderShorthand = own.get("border");
  const border = own.has("border-color") ? value(own.get("border-color")!) : borderShorthand ? value(splitTopLevel(borderShorthand, " ").find((t) => !/^(\d|solid|none|var\(--theme-foundation-border)/.test(t)) ?? "currentcolor") : "none";
  const outlineShorthand = own.get("outline");
  const outline = own.has("outline-color") ? value(own.get("outline-color")!) : outlineShorthand ? value(splitTopLevel(outlineShorthand, " ").at(-1)!) : "none";
  const result = { vars, color, background: bg === "currentcolor" ? color : bg, border: border === "currentcolor" ? color : border, outline, other: new Map([...own].filter(([k]) => !k.startsWith("--")).map(([k, v]) => [k, value(v)])) };
  if (!pseudo) computedCache.set(element, result);
  return result;
}

function resolveValue(raw: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() cycle in ${raw}`);
  let text = raw.trim();
  // Innermost var() first, honoring fallbacks.
  for (let guard = 0; /var\(/.test(text) && guard < 50; guard++) {
    const start = text.lastIndexOf("var(");
    let level = 0, end = start + 3;
    for (; end < text.length; end++) { if (text[end] === "(") level++; else if (text[end] === ")" && --level === 0) break; }
    const [name, ...fallback] = splitTopLevel(text.slice(start + 4, end), ",");
    const replacement = vars.has(name) ? resolveValue(vars.get(name)!, vars, depth + 1) : fallback.length ? fallback.join(",") : "unset";
    text = text.slice(0, start) + replacement + text.slice(end + 1);
  }
  const mix = /^color-mix\(\s*in srgb\s*,(.*)\)$/i.exec(text);
  if (mix) {
    const [a, b] = splitTopLevel(mix[1], ",").map((part) => { const m = /^(.*?)\s+([\d.]+)%$/.exec(part.trim()); return m ? { color: m[1], weight: Number(m[2]) / 100 } : { color: part.trim(), weight: NaN }; });
    const wa = Number.isNaN(a.weight) ? 1 - b.weight : a.weight, wb = Number.isNaN(b.weight) ? 1 - wa : b.weight;
    return mixColors(rgba(a.color), rgba(b.color), wa, wb);
  }
  return /^#|^transparent$/i.test(text) ? hex(rgba(text)) : text.toLowerCase() === "currentcolor" ? "currentcolor" : text;
}
type RGBA = [number, number, number, number];
function rgba(value: string): RGBA {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return [0, 0, 0, 0];
  const m = /^#([\da-f]{3,8})$/.exec(v);
  if (!m) throw new Error(`Not a resolvable color: ${value}`);
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
  return [n[0], n[1], n[2], n[3] / 255];
}
// CSS Color 5 color-mix in srgb: premultiplied interpolation.
function mixColors(a: RGBA, b: RGBA, wa: number, wb: number) {
  const alpha = a[3] * wa + b[3] * wb;
  const channel = (i: number) => (alpha === 0 ? 0 : (a[i] * a[3] * wa + b[i] * b[3] * wb) / alpha);
  return hex([channel(0), channel(1), channel(2), alpha]);
}
const hex = ([r, g, b, a]: RGBA) => "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("") + (a >= 0.999 ? "" : Math.round(a * 255).toString(16).padStart(2, "0"));
// Source-over composition onto an opaque backdrop.
function over(top: string, backdrop: string): string {
  const [r, g, b, a] = rgba(top), [R, G, B] = rgba(backdrop);
  return hex([r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1]);
}
function luminance(color: string) {
  const [r, g, b] = rgba(color).slice(0, 3).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** The real sidebar markup (App.svelte + Button.svelte) in its own document. */
function sidebar(platform: Platform, window: "active" | "inactive" | "unknown", options: { theme?: Theme; explicitDark?: boolean; state?: State; unselectedState?: State } = {}) {
  const doc = document.implementation.createHTMLDocument("sidebar");
  const root = doc.documentElement;
  root.dataset.platform = platform;
  root.dataset.appearance=platform;
  if (window !== "unknown") root.dataset.window = window;
  if (options.explicitDark) root.dataset.theme = "dark";
  if (options.theme) {
    applyCustomTheme(options.theme);
    root.setAttribute("style", document.documentElement.getAttribute("style") ?? "");
    if (document.documentElement.dataset.theme) root.dataset.theme = document.documentElement.dataset.theme;
  }
  doc.body.innerHTML = `<div class="v2-shell"><aside class="v2-sidebar" id="main-navigation"><nav aria-label="Main navigation">
    <button type="submit" class="ui-button ghost  " aria-label="Search" title="Search"><svg class="lucide-icon lucide lucide-search"></svg><span>Search</span></button>
    <button type="submit" class="ui-button ghost  active" aria-label="Downloads" title="Downloads" aria-current="page"><svg class="lucide-icon lucide lucide-download"></svg><span>Downloads</span><b>2</b></button>
  </nav></aside></div>`;
  const [plain, selected] = Array.from(doc.querySelectorAll("nav .ui-button"));
  const mark = (element: Element, state?: State) => { if (state?.hover) element.classList.add("__hover"); if (state?.focusVisible) element.classList.add("__focus"); };
  mark(selected, options.state);
  mark(plain, options.unselectedState);
  return { root, aside: doc.querySelector(".v2-sidebar")!, selected, plain };
}
function read(platform: Platform, window: "active" | "inactive" | "unknown", env: Env, options: Parameters<typeof sidebar>[2] = {}) {
  computedCache.clear();
  const s = sidebar(platform, window, options);
  const asideBg = computed(s.aside, env).background;
  const row = (button: Element) => {
    const c = computed(button, env);
    const fill = c.background === "transparent" || /^#[\da-f]{8}$/.test(c.background) ? over(c.background, asideBg) : c.background;
    return { fill, raw: c.background, label: computed(button.querySelector("span")!, env).color, icon: computed(button.querySelector("svg")!, env).color, badge: button.querySelector("b") ? computed(button.querySelector("b")!, env).color : null, border: c.border, outline: c.outline, other: c.other, before: computed(button, env, "before") };
  };
  const vars = computed(s.root, env).vars;
  const token = (name: string) => resolveValue(`var(${name})`, vars);
  return { asideBg, selected: row(s.selected), plain: row(s.plain), token };
}

const platforms: Platform[] = ["macos", "windows", "linux"];
const appearances: [string, Env, boolean][] = [["light", { dark: false }, false], ["dark", { dark: true }, false], ["explicit dark", { dark: false }, true]];
afterEach(() => {
  applyCustomTheme(null);
  delete document.documentElement.dataset.theme;
});

describe("macOS sidebar selection follows native window activation", () => {
  for (const [name, env, explicitDark] of appearances)
    it(`${name}: accent fill when active, secondary gray when inactive`, () => {
      const active = read("macos", "active", env, { explicitDark });
      const inactive = read("macos", "inactive", env, { explicitDark });
      const unknown = read("macos", "unknown", env, { explicitDark });
      expect(active.selected.fill).toBe(active.token("--accent"));
      for (const part of [active.selected.label, active.selected.icon, active.selected.badge]) {
        expect(part).toBe(active.token("--accent-contrast"));
        expect(contrast(part!, active.selected.fill), `${name} active selected content`).toBeGreaterThanOrEqual(4.5);
      }
      // Not knowing the state yet looks active (no inactive flash at startup).
      expect(unknown.selected).toEqual(active.selected);
      expect(inactive.selected.fill).toBe(inactive.token("--selection-bg"));
      expect(inactive.selected.fill).not.toBe(active.selected.fill);
      expect(inactive.selected.label).toBe(inactive.token("--text"));
      expect(inactive.selected.badge).toBe(inactive.token("--text"));
      expect(inactive.selected.icon).toBe(inactive.token("--muted"));
      expect(contrast(inactive.selected.label, inactive.selected.fill)).toBeGreaterThanOrEqual(7);
      expect(contrast(inactive.selected.icon, inactive.selected.fill), `${name} inactive selected symbol`).toBeGreaterThanOrEqual(3);
      // Unselected symbols: accent tint when active, gray when inactive.
      expect(active.plain.icon).toBe(active.token("--accent-text"));
      expect(inactive.plain.icon).toBe(inactive.token("--muted"));
      expect(contrast(inactive.plain.icon, inactive.asideBg)).toBeGreaterThanOrEqual(4.5);
      // No opacity wash: activation changes colors only.
      expect(inactive.selected.other.get("opacity")).toBeUndefined();
    });

  it("keeps the selected row blue under hover, and unselected hover distinct from selection", () => {
    for (const [name, env] of appearances) {
      const rest = read("macos", "active", env);
      const hovered = read("macos", "active", env, { state: { hover: true }, unselectedState: { hover: true } });
      expect(hovered.selected, name).toEqual(rest.selected);
      expect(hovered.plain.fill, name).not.toBe(rest.plain.fill);
      expect(hovered.plain.fill, name).not.toBe(rest.selected.fill);
      expect(hovered.plain.label, name).toBe(rest.token("--text"));
      expect(read("macos", "inactive", env, { state: { hover: true } }).selected.fill, name).toBe(read("macos", "inactive", env).selected.fill);
    }
  });

  it("keeps the keyboard focus ring separate from the selection fill", () => {
    for (const window of ["active", "inactive"] as const) {
      const focused = read("macos", window, { dark: false }, { state: { focusVisible: true }, unselectedState: { focusVisible: true } });
      for (const row of [focused.selected, focused.plain]) {
        expect(row.outline).toBe(focused.token("--focus-ring"));
        expect(row.other.get("z-index")).toBe("1");
      }
      expect(focused.selected.fill).toBe(read("macos", window, { dark: false }).selected.fill);
      // The ring is opaque (>=3:1). Where it shares the accent with the selection
      // fill it stays separate by sitting outside the row, with sidebar between.
      expect(contrast(focused.selected.outline, focused.asideBg)).toBeGreaterThanOrEqual(3);
      if (focused.selected.outline === focused.selected.fill)
        expect(parseFloat(focused.selected.other.get("outline-offset") ?? "0")).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Windows and Linux selection treatments", () => {
  it("Windows keeps its Fluent selection and accent indicator in both window states", () => {
    for (const [name, env, explicitDark] of appearances) {
      const active = read("windows", "active", env, { explicitDark });
      const inactive = read("windows", "inactive", env, { explicitDark });
      expect(inactive.selected, name).toEqual(active.selected);
      expect(active.selected.fill).toBe(active.token("--selection-bg"));
      expect(active.selected.before.background).toBe(active.token("--accent"));
      expect(contrast(active.selected.label, active.selected.fill)).toBeGreaterThanOrEqual(7);
      expect(contrast(active.selected.badge!, active.selected.fill)).toBeGreaterThanOrEqual(4.5);
      expect(active.asideBg).toBe(inactive.asideBg);
    }
  });

  it("Linux switches the sidebar to the GNOME backdrop color while unfocused", () => {
    for (const [name, env, explicitDark] of appearances) {
      const active = read("linux", "active", env, { explicitDark });
      const inactive = read("linux", "inactive", env, { explicitDark });
      expect(active.asideBg, name).toBe(active.token("--sidebar-bg"));
      expect(inactive.asideBg, name).toBe(env.dark || explicitDark ? "#28282c" : "#f2f2f4");
      expect(inactive.selected.raw).toBe(active.selected.raw);
      expect(contrast(inactive.plain.label, inactive.asideBg)).toBeGreaterThanOrEqual(7);
      expect(contrast(inactive.selected.label, inactive.selected.fill)).toBeGreaterThanOrEqual(7);
      expect(contrast(inactive.plain.icon, inactive.asideBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(inactive.selected.badge!, inactive.selected.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("accessibility media", () => {
  it("forced colors use the system highlight pair for the whole selected row on every platform and window state", () => {
    for (const platform of platforms)
      for (const window of ["active", "inactive"] as const) {
        const { selected } = read(platform, window, { dark: false, forced: true }, { state: { hover: true } });
        const at = `${platform} ${window}`;
        expect(selected.other.get("forced-color-adjust"), at).toBe("none");
        expect(selected.fill, at).toBe("Highlight");
        for (const part of [selected.label, selected.icon, selected.badge]) expect(part, at).toBe("HighlightText");
        if (platform === "windows") expect(selected.before.background, at).toBe("HighlightText");
      }
  });

  it("increased contrast edges a gray selection but not the macOS accent fill", () => {
    const env = { dark: false, contrastMore: true };
    expect(read("macos", "inactive", env).selected.border).toBe(read("macos", "inactive", env).token("--text"));
    expect(read("macos", "active", env, { state: { hover: true } }).selected.border).toBe("#00000000");
    expect(read("windows", "active", env).selected.border).toBe(read("windows", "active", env).token("--text"));
    expect(read("linux", "inactive", env).selected.border).toBe(read("linux", "inactive", env).token("--text"));
    // Linux's own hover rule clears control borders; the selection edge stays.
    expect(read("linux", "active", env, { state: { hover: true } }).selected.border).toBe(read("linux", "active", env).token("--text"));
  });

  it("switches selection instantly, with or without reduced motion", () => {
    for (const reducedMotion of [false, true])
      for (const platform of platforms) expect(read(platform, "inactive", { dark: false, reducedMotion }).selected.other.get("transition")).toBe("none");
  });
});

describe("imported themes", () => {
  // Themes from releases before the platform refresh know only the original fields.
  const legacy = (values: Record<string, string>, base: Theme["base"] = "dark") => validateTheme({ version: 1, name: "Legacy", base, font: "system", values });
  const original = legacy({ bg: "#0e1210", surface: "#141815", surface_raised: "#1c221e", surface_soft: "#252c27", line: "#2a322c", line_strong: "#3a443d", text: "#eef2ee", muted: "#a7b0a9", dim: "#7d867f", accent: "#f0a94b", accent_strong: "#f5b964", accent_soft: "#f0a94b26" });
  const paleLight = legacy({ accent: "#9cc3ff", text: "#202020", surface: "#fbfbfb" }, "light");
  // The editor exports every field, so the platform's gray selection is baked in.
  const exported = validateTheme({ version: 1, name: "Exported", base: "light", font: "system", values: { sidebar_bg: "#e8e8ea", selection_bg: "#d4d4d9", text: "#1d1d1f", muted: "#5f5f64", accent: "#0064d2", accent_text: "#0060c9", accent_contrast: "#ffffff" } });

  for (const [name, theme] of [["original dark", original], ["pale light accent", paleLight], ["editor export", exported]] as const)
    it(`${name}: readable selection in both macOS window states without mixing palettes`, () => {
      const env = { dark: false };
      const active = read("macos", "active", env, { theme });
      const inactive = read("macos", "inactive", env, { theme });
      expect(active.selected.fill).toBe(theme.values.accent);
      for (const part of [active.selected.label, active.selected.icon, active.selected.badge]) {
        expect(part).toBe(active.token("--accent-contrast"));
        expect(contrast(part!, active.selected.fill), `${name} active`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(inactive.selected.label, inactive.selected.fill), `${name} inactive label`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(inactive.selected.badge!, inactive.selected.fill), `${name} inactive count`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(inactive.selected.icon, inactive.selected.fill), `${name} inactive symbol`).toBeGreaterThanOrEqual(3);
      expect(inactive.selected.label).toBe(theme.values.text ?? inactive.token("--text"));
    });

  it("a theme's own sidebar stays its color when a Linux window is unfocused", () => {
    const active = read("linux", "active", { dark: false }, { theme: original });
    const inactive = read("linux", "inactive", { dark: false }, { theme: original });
    expect(active.asideBg).toBe("#141815");
    expect(inactive.asideBg).toBe("#141815");
    applyCustomTheme(null);
    expect(document.documentElement.style.getPropertyValue("--sidebar-backdrop")).toBe("");
  });

  it("explicit Light and Dark choices keep their own palette in both window states", () => {
    for (const window of ["active", "inactive"] as const) {
      const explicit = read("macos", window, { dark: false }, { explicitDark: true });
      const system = read("macos", window, { dark: true });
      expect(explicit.selected, window).toEqual(system.selected);
      expect(explicit.asideBg).toBe(system.asideBg);
    }
  });
});
