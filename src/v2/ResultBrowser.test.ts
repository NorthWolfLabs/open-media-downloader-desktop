import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/svelte";
import ResultBrowser from "./ResultBrowser.svelte";
import type { Collection, EngineClient } from "./client";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const items = (n: number): Collection[] =>
  Array.from({ length: n }, (_, i) => ({
    reference: { provider: "fixture", id: String(i) },
    title: `Title ${i}`,
    kind: "manga",
    canonical_url: `https://example.org/${i}`,
    description: "Description",
    artwork_url: null,
  }));
it("keeps the rendered catalog bounded and fills grid rows while more results are available", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 1000,
    height: 800,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON() {},
  });
  render(ResultBrowser, {
    items: items(1003),
    client: {} as EngineClient,
    layout: "grid",
    hasMore: true,
    oncollection: vi.fn(),
  });
  await waitFor(() =>
    expect(document.querySelectorAll(".result-item").length).toBeGreaterThan(0),
  );
  const visible = document.querySelectorAll(".result-item");
  expect(visible.length).toBeLessThan(100);
  expect(visible.length % 5).toBe(0);
  expect(screen.getByRole("button", { name: "Title 0" })).toBeTruthy();
});
it("prefetches before the visible rows are exhausted without duplicating an outstanding request", async () => {
  let finish!: () => void;
  const more = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  const props = {
    items: items(10),
    client: {} as EngineClient,
    layout: "list" as const,
    hasMore: true,
    onmore: more,
    oncollection: vi.fn(),
  };
  const view = render(ResultBrowser, props);
  await waitFor(() => expect(more).toHaveBeenCalledTimes(1));
  await view.rerender({ ...props, items: items(12) });
  expect(more).toHaveBeenCalledTimes(1);
  await view.rerender({ ...props, items: items(12), hasMore: false });
  finish();
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
});

it.each(["grid", "list", "compact", "gallery"] as const)(
  "uses the %s result layout while loading, fills the viewport, and keeps geometry on arrival",
  async (layout) => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 800,
      top: 100,
      left: 0,
      right: 1000,
      bottom: 900,
      x: 0,
      y: 100,
      toJSON() {},
    });
    const props = {
      items: [] as Collection[],
      client: {} as EngineClient,
      layout,
      loading: true,
      oncollection: vi.fn(),
    };
    const view = render(ResultBrowser, props);
    await waitFor(() =>
      expect(
        document.querySelector(".result-placeholders.revealed"),
      ).toBeTruthy(),
    );
    if (layout === "gallery")
      expect(
        document.querySelector(".gallery-placeholder .item-overview.gallery"),
      ).toBeTruthy();
    else {
      const area = document.querySelector(
        ".result-placeholders",
      ) as HTMLElement;
      const columns = Number(area.style.getPropertyValue("--columns"));
      const row = Number.parseFloat(area.style.getPropertyValue("--row"));
      expect(document.querySelectorAll(".placeholder-item").length).toBe(
        columns * Math.ceil(parseFloat(area.style.height) / row),
      );
      expect(
        document.querySelectorAll(".placeholder-item .artwork").length,
      ).toBe(
        layout === "compact"
          ? 0
          : document.querySelectorAll(".placeholder-item").length,
      );
      await view.rerender({ ...props, loading: false, items: items(30) });
      await waitFor(
        () => expect(document.querySelector(".result-placeholders")).toBeNull(),
        { timeout: 1500 },
      );
      const surface = document.querySelector(".virtual-surface") as HTMLElement;
      expect(surface.style.getPropertyValue("--columns")).toBe(String(columns));
      expect(surface.style.getPropertyValue("--row")).toBe(`${row}px`);
    }
  },
);
it("uses landscape placeholders for media-only sources before any result arrives", async () => {
  const props = {
    items: [] as Collection[],
    client: {} as EngineClient,
    layout: "grid" as const,
    loading: true,
    sources: { fixture: "Video" },
    manifests: { fixture: { media_tools: true } as any },
    oncollection: vi.fn(),
  };
  const view = render(ResultBrowser, props);
  await waitFor(() =>
    expect(
      document.querySelector(".result-placeholders.revealed .media-grid"),
    ).toBeTruthy(),
  );
  const before = (
    document.querySelector(".result-placeholders") as HTMLElement
  ).style.getPropertyValue("--row");
  await view.rerender({ ...props, loading: false, items: items(24) });
  await waitFor(
    () => expect(document.querySelector(".virtual-surface")).toBeTruthy(),
    { timeout: 1500 },
  );
  expect(
    (
      document.querySelector(".virtual-surface") as HTMLElement
    ).style.getPropertyValue("--row"),
  ).toBe(before);
});
it("does not flash placeholders for a fast result", async () => {
  const props = {
    items: [] as Collection[],
    client: {} as EngineClient,
    loading: true,
    oncollection: vi.fn(),
  };
  const view = render(ResultBrowser, props);
  expect(document.querySelector(".result-placeholders.revealed")).toBeNull();
  await view.rerender({ ...props, loading: false, items: items(2) });
  await screen.findByRole("button", { name: "Title 0" });
  expect(document.querySelector(".result-placeholders")).toBeNull();
});

it("recalculates placeholder rows and columns when the viewport is resized", async () => {
  let width = 1000,
    height = 700;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({
      width,
      height,
      top: 100,
      left: 0,
      right: width,
      bottom: height + 100,
      x: 0,
      y: 100,
      toJSON() {},
    }),
  );
  vi.spyOn(window, "innerHeight", "get").mockImplementation(() => height + 100);
  render(ResultBrowser, {
    items: [],
    client: {} as EngineClient,
    loading: true,
    oncollection: vi.fn(),
  });
  await waitFor(() =>
    expect(
      document.querySelector(".result-placeholders.revealed"),
    ).toBeTruthy(),
  );
  const area = document.querySelector(".result-placeholders") as HTMLElement;
  expect(area.style.getPropertyValue("--columns")).toBe("5");
  width = 600;
  height = 1000;
  window.dispatchEvent(new Event("resize"));
  await waitFor(() =>
    expect(area.style.getPropertyValue("--columns")).toBe("3"),
  );
  const row = parseFloat(area.style.getPropertyValue("--row"));
  expect(document.querySelectorAll(".placeholder-item").length).toBe(
    3 * Math.ceil(1000 / row),
  );
});

it.each(["grid", "list", "compact"] as const)(
  "preserves complete metadata in %s rows and positions later rows below wrapped tags",
  async (layout) => {
    const watchers: { node: Element; callback: ResizeObserverCallback }[] = [];
    class Observer {
      constructor(private callback: ResizeObserverCallback) {}
      observe(node: Element) {
        watchers.push({ node, callback: this.callback });
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", Observer);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const height = this.classList.contains("result-row") ? 650 : 800;
        return {
          width: 1000,
          height,
          top: 0,
          left: 0,
          right: 1000,
          bottom: height,
          x: 0,
          y: 0,
          toJSON() {},
        };
      },
    );
    const tags = [
      "Romance",
      "Comedy",
      "Office Workers",
      "Slice of Life",
      "Gyaru",
      "An unusually long tag that also needs to remain readable",
    ];
    const data = items(30).map((item) => ({
      ...item,
      summary: { tags, status: "Ongoing", year: 2023, rating: 4.4 },
    }));
    render(ResultBrowser, {
      items: data,
      client: {} as EngineClient,
      layout,
      oncollection: vi.fn(),
    });
    await screen.findByRole("button", { name: "Title 0" });
    const first = screen.getByRole("button", { name: "Title 0" });
    expect(
      [...first.querySelectorAll(".tags .source-badge")].map((tag) =>
        tag.textContent?.trim(),
      ),
    ).toEqual(tags);
    expect(first.textContent).toContain("2023");
    expect(first.textContent).toContain("Ongoing");
    for (const entry of [...watchers].filter((entry) =>
      entry.node.classList.contains("result-row"),
    ))
      entry.callback([], {} as ResizeObserver);
    await waitFor(() =>
      expect(
        (document.querySelectorAll(".result-row")[1] as HTMLElement).style.top,
      ).toBe("650px"),
    );
    expect(
      parseFloat(
        (document.querySelector(".virtual-surface") as HTMLElement).style
          .height,
      ),
    ).toBeGreaterThan(650 * 2);
    vi.unstubAllGlobals();
  },
);

it.each(["grid", "list", "compact"] as const)(
  "keeps video facts and direct detail navigation in %s",
  async (layout) => {
    const selected = {
      ...items(1)[0],
      kind: "item" as const,
      summary: {
        creators: ["Creator"],
        duration_seconds: 748,
        view_count: 140000,
        published_label: new Date(Date.now() - 3600000).toISOString(),
      },
    };
    const oncollection = vi.fn();
    render(ResultBrowser, {
      items: [selected],
      client: {} as EngineClient,
      layout,
      oncollection,
      manifests: { fixture: { media_tools: true } as any },
    });
    expect(await screen.findByText("12:28")).toBeTruthy();
    expect(screen.getByText("140K views")).toBeTruthy();
    expect(screen.getByText("1 hour ago")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: selected.title }));
    expect(oncollection).toHaveBeenCalledWith(selected);
  },
);
