import type { Collection, DiscoveryQuery, DiscoverySchema } from "./client";
export type DiscoveryState = {
  catalog: {query:string;scroll:number};
  selected: string[];
  query: string;
  languages: string | null;
  filtersOpen: boolean;
  applied: Record<string, Record<string, unknown>>;
  results: Collection[];
  cursors: Record<string, string | null>;
  issues: Record<string, string>;
  schemas: Record<string, DiscoverySchema>;
  schemaVersions: Record<string, string>;
  schemaAccounts: Record<string, string>;
  options: Record<string, DiscoveryQuery>;
  searched: boolean;
  editing: boolean;
  galleryIndex: number;
  layout: import("./LayoutPicker.svelte").ResultLayout;
};
export function discoveryState(): DiscoveryState {
  let selected: string[] = [];
  try {
    const stored = JSON.parse(
      localStorage.getItem("omd.search-sources") ?? "[]",
    );
    if (Array.isArray(stored))
      selected = stored.filter((v) => typeof v === "string");
  } catch {}
  return {
    catalog:{query:"",scroll:0},
    selected,
    query: "",
    languages: null,
    filtersOpen: false,
    applied: {},
    results: [],
    cursors: {},
    issues: {},
    schemas: {},
    schemaVersions: {},
    schemaAccounts: {},
    options: {},
    searched: false,
    editing: true,
    galleryIndex: 0,
    layout: (["grid", "list", "compact", "gallery"].includes(
      localStorage.getItem("omd.search-layout") ?? "",
    )
      ? localStorage.getItem("omd.search-layout")
      : "grid") as import("./LayoutPicker.svelte").ResultLayout,
  };
}
/** Alternate providers while retaining each provider's own ranking. Source identity never merges by title. */
export function mergeSourcePages(
  previous: Collection[],
  pages: { provider: string; items: Collection[] }[],
) {
  const result = [...previous],
    found = new Set(previous.map((item) => JSON.stringify(item.reference)));
  for (
    let index = 0;
    index < Math.max(0, ...pages.map((p) => p.items.length));
    index++
  )
    for (const page of pages) {
      const item = page.items[index];
      if (!item) continue;
      const key = JSON.stringify(item.reference);
      if (!found.has(key)) {
        found.add(key);
        result.push(item);
      }
    }
  return result;
}

/** One toast line for a failed source: the source is named once and the sentence ends once. */
export function sourceIssueMessage(name: string, message: string, retrying: boolean): string {
  const text = message.trim().replace(/\.+$/, "");
  const named = text.toLocaleLowerCase().includes(name.toLocaleLowerCase()) ? text : `${name}: ${text}`;
  const sentence = /[!?…]$/.test(named) ? named : `${named}.`;
  return retrying ? `${sentence} Retrying automatically…` : sentence;
}
