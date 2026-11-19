// Guards the list/compact release rows: a row's selection holds a checkbox and may hold
// other controls (such as "Downloaded"). The checkbox column is only 28px wide, so those
// controls need their own column; placed in the checkbox column they overflowed onto the
// row's artwork. JSDOM has no layout and Vitest blanks CSS imports, so this reads the
// component's style text and checks the declarations that place each part.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const source = read("./ResultBrowser.svelte");
const css = source.match(/<style>([\s\S]*?)<\/style>/)![1].replace(/\/\*[\s\S]*?\*\//g, "");

// Splits a selector list on top-level commas (not those inside :is(...) or :global(...)).
function selectors(list: string) {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let index = 0; index < list.length; index++) {
    if (list[index] === "(") depth++;
    else if (list[index] === ")") depth--;
    else if (list[index] === "," && depth === 0) {
      parts.push(list.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((part) => part.replace(/\s+/g, " ").trim());
}

// Declarations of every top-level rule whose selector list contains `selector` (later rules win).
function declarations(selector: string) {
  const values = new Map<string, string>();
  let found = 0;
  for (const [, list, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors(list).includes(selector)) continue;
    found++;
    for (const declaration of body.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0) values.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
  }
  expect(found, `rules for ${selector}`).toBeGreaterThan(0);
  return (property: string) => values.get(property) ?? "";
}

const row = ":is(.list,.compact) .result-entry.selectable";
const checked = `${row}:has(:global(input))`;

describe("list and compact selection layout", () => {
  it("keeps rows without extra controls on the checkbox and item columns", () => {
    expect(declarations(row)("grid-template-columns")).toBe("28px minmax(0,1fr)");
  });

  it("flattens the selection so its parts become row cells", () => {
    expect(declarations(`${checked}>.result-selection`)("display")).toBe("contents");
    expect(declarations(`${checked}>.result-selection>:global(div)`)("display")).toBe("contents");
  });

  it("keeps the checkbox in the 28px column", () => {
    const label = declarations(`${checked}>.result-selection :global(label)`);
    expect([label("grid-column"), label("grid-row")]).toEqual(["1", "1"]);
  });

  it("gives other controls a trailing column in compact rows", () => {
    const compact = ".compact .result-entry.selectable:has(:global(input))";
    expect(declarations(`${compact}:has(>.result-selection :global(:is(button,a)))`)("grid-template-columns")).toBe(
      "28px minmax(0,1fr) auto",
    );
    const control = declarations(`${compact}>.result-selection :global(:is(button,a))`);
    expect([control("grid-column"), control("grid-row")]).toEqual(["3", "1"]);
  });

  it("puts other controls under the item in list rows, keeping the item column's width", () => {
    const list = ".list .result-entry.selectable:has(:global(input))";
    const control = declarations(`${list}>.result-selection :global(:is(button,a))`);
    expect([control("grid-column"), control("grid-row")]).toEqual(["2", "2"]);
    expect(css).not.toMatch(/\.list[^{}]*:has\(>\.result-selection[^{}]*\{[^}]*grid-template-columns/);
  });
});
