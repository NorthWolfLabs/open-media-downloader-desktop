import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import Discovery from "./DiscoveryHarness.svelte";
import GalleryItem from "./GalleryItem.svelte";
import { discoveryState } from "./discoveryState";
import { cachedItemMetadata, mainItem } from "./itemCache";
import type {
  Collection,
  CollectionDetails,
  EngineClient,
  ProviderManifest,
} from "./client";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
const item = (id: string): Collection => ({
  reference: { provider: "catalog", id },
  title: `Title ${id}`,
  kind: "manga",
  canonical_url: `https://example.org/${id}`,
  description: "Search description",
  artwork_url: null,
  summary: {
    tags: ["Romance"],
    status: "completed",
    year: 2024,
    languages: ["en"],
    original_language: "ja",
  },
});
const info = (collection: Collection): CollectionDetails => ({
  reference: collection.reference,
  description: "Full description",
  tags: [{ id: "romance", label: "Romance" }],
  creators: [{ label: "Author", values: ["Source author"] }],
  facts: [{ label: "Publication year", values: ["2024"] }],
  alternative_titles: { ja: ["Alternate title"] },
  languages: ["en"],
});
it("renders source summaries without launching per-result metadata requests", async () => {
  const items = Array.from({ length: 105 }, (_, i) => item(String(i)));
  const operation = vi.fn();
  const state = discoveryState();
  Object.assign(state, {
    selected: ["catalog"],
    results: items,
    searched: true,
    editing: false,
  });
  render(Discovery, {
    client: { operation } as unknown as EngineClient,
    state,
    sources: [
      {
        manifest: {
          id: "catalog",
          name: "Catalog",
          version: "1",
          capabilities: ["search", "collection", "details"],
        } as ProviderManifest,
      },
    ],
    accounts: {},
    languages: "en",
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
  });
  await screen.findByRole("button", { name: "Title 0" });
  expect(screen.getAllByText("2024").length).toBeGreaterThan(0);
  expect(operation).not.toHaveBeenCalled();
});
it("shares preloaded metadata with gallery, survives two minutes of browsing, and scopes it to the account", async () => {
  const collection = item("1");
  let now = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const operation = vi.fn(async () => info(collection));
  const client = { operation } as unknown as EngineClient;
  await mainItem(client, collection, true, "account-a");
  now += 121000;
  render(GalleryItem, {
    client,
    collection,
    source: "Catalog",
    supportsDetails: true,
    account: "account-a",
    oncollection: vi.fn(),
  });
  await screen.findByText("Source author");
  expect(screen.getByText("Alternate title")).toBeTruthy();
  expect(screen.queryByRole("group", { name: "Item sections" })).toBeNull();
  expect(operation).toHaveBeenCalledTimes(1);
  expect(
    cachedItemMetadata(
      client,
      { ...collection, reference: { id: "1", provider: "catalog" } },
      "details",
      "account-a",
    ),
  ).toEqual(info(collection));
  expect(
    cachedItemMetadata(client, collection, "details", "account-b"),
  ).toBeUndefined();
  await mainItem(client, collection, true, "account-b");
  expect(operation).toHaveBeenCalledTimes(2);
});
it("renders existing card metadata in gallery while richer metadata is still unresolved", async () => {
  const collection = item("1");
  const operation = vi.fn(() => new Promise(() => {}));
  render(GalleryItem, {
    client: { operation } as unknown as EngineClient,
    collection,
    source: "Catalog",
    supportsDetails: true,
    oncollection: vi.fn(),
  });
  expect(screen.getByText("Romance")).toBeTruthy();
  expect(screen.getByText("2024")).toBeTruthy();
  expect(screen.getByText("Japanese")).toBeTruthy();
  expect(screen.getByText("completed")).toBeTruthy();
  expect(screen.getByRole("button", { name: "View details" })).toBeTruthy();
  await waitFor(() => expect(operation).toHaveBeenCalledTimes(1));
  expect(operation.mock.calls[0]).toEqual([
    "catalog",
    expect.objectContaining({ operation: "details" }),
  ]);
});

it("keeps sparse cards stable and loads full metadata when gallery is opened", async () => {
  const sparse = {
    ...item("html"),
    summary: { rating: 4.4 },
    description: null,
  };
  const full = {
    ...sparse,
    summary: { status: "Ongoing", year: 2018 },
    description: "Full description",
  };
  const operation = vi.fn(async (_id: string, input: any) =>
    input.operation === "collection" ? full : info(sparse),
  );
  const state = discoveryState();
  Object.assign(state, {
    selected: ["catalog"],
    results: [sparse],
    searched: true,
    editing: false,
  });
  const client = { operation } as unknown as EngineClient;
  const props = {
    client,
    state,
    sources: [
      {
        manifest: {
          id: "catalog",
          name: "Catalog",
          version: "1",
          capabilities: ["search", "collection", "details"],
        } as ProviderManifest,
      },
    ],
    accounts: {},
    languages: "en",
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
  };
  const view = render(Discovery, props);
  await screen.findByRole("button", { name: "Title html" });
  expect(operation).not.toHaveBeenCalled();
  view.unmount();
  render(Discovery, { ...props, state: { ...state, layout: "gallery" } });
  await screen.findByText("Full description");
  expect(operation).toHaveBeenCalledTimes(2);
});

it("shows relative upload time in a video gallery after full details arrive", async () => {
  const video = {...item("video-age"), kind:"item" as const, summary:{published_label:new Date(Date.now()-7200000).toISOString()}};
  render(GalleryItem, {client:{operation:vi.fn().mockResolvedValue(video)} as unknown as EngineClient,collection:video,source:"Example Video",media:true,oncollection:vi.fn()});
  expect(await screen.findByText("2 hours ago")).toBeTruthy();
});
