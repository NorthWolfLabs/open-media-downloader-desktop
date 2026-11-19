// Guards G1: on WebKitGTK 2.52 a column flex container whose height is the UA
// `fit-content` of [popover] (and <dialog>) is sized from its items' flex bases, so
// a `flex: 1` (0% basis) item collapses to its padding. JSDOM has no layout, so these
// tests read the shipped styles (Vitest blanks CSS imports) and check the declarations
// that keep such panels content-sized in every engine.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

// Declarations of the rules whose whole selector is `selector` (later rules win).
// Parsed directly: JSDOM's CSSOM does not expand the `flex` shorthand.
function declarations(css: string, selector: string) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blocks = [...text.matchAll(new RegExp(`(?:^|[{};])\\s*${escaped}\\s*\\{([^{}]*)\\}`, "g"))].map((match) => match[1]);
  expect(blocks.length, `rules for ${selector}`).toBeGreaterThan(0);
  const values = new Map<string, string>();
  for (const block of blocks)
    for (const declaration of block.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0) values.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
  return (property: string) => values.get(property) ?? "";
}

// The flex basis a rule sets, following the `flex` shorthand: `flex: 1` and
// `flex: 1 1` mean a 0% basis; `auto`, `none` and `initial` mean auto.
function flexBasis(get: (property: string) => string) {
  if (get("flex-basis")) return get("flex-basis");
  const flex = get("flex");
  if (!flex) return "";
  if (["auto", "none", "initial"].includes(flex)) return "auto";
  const parts = flex.split(/\s+/);
  const numeric = (part: string) => /^[0-9.]+$/.test(part);
  if (parts.every(numeric)) return "0%";
  return parts.find((part) => !numeric(part))!;
}

const svelteStyle = (file: string) => source(file).match(/<style>([\s\S]*?)<\/style>/)![1];

describe("dropdown panels keep their content height", () => {
  const css = svelteStyle("./ChoicePicker.svelte");

  it("does not size the choice popover from the UA fit-content height", () => {
    expect(declarations(css, ".choice-popover")("height")).toBe("auto");
    expect(declarations(css, ".choice-popover:popover-open")("flex-direction")).toBe("column");
  });

  it("gives every block-axis item of the choice popover an auto flex basis", () => {
    for (const selector of [".choice-search", ".choice-footer"])
      expect(["", "auto"], selector).toContain(flexBasis(declarations(css, selector)));
    expect(flexBasis(declarations(css, ".choice-list"))).toBe("auto");
    expect(declarations(css, ".choice-list")("min-height")).toBe("0");
  });

  it("keeps the dialog's flex column on auto bases too", () => {
    const foundation = source("./ui/foundation.css");
    expect(declarations(foundation, "dialog[open]")("flex-direction")).toBe("column");
    for (const selector of [".v2-dialog-header", ".v2-dialog-content", ".v2-dialog-footer"])
      expect(["", "auto"], selector).toContain(flexBasis(declarations(foundation, selector)));
  });
});
