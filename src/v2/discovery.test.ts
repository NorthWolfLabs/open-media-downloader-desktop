import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import Discovery from "./DiscoveryHarness.svelte";
import { discoveryState } from "./discoveryState";
import type { EngineClient, ProviderManifest, Collection } from "./client";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const source = (id: string) => ({
  manifest: {
    id,
    name: id,
    api: "omd:provider@2.0.0",
    version: "0.3.0",
    description: "Fixture",
    source_hosts: ["example.org"],
    capabilities: ["search", "browse"],
    grants: [],
  } as ProviderManifest,
});
const item = (provider: string, id: string): Collection => ({
  reference: { provider, id },
  title: id,
  kind: "manga",
  canonical_url: `https://example.org/${id}`,
  description: null,
  artwork_url: null,
});
it("searches selected providers concurrently, preserves relevance order, and continues the applied query", async () => {
  let resolveFirst!: (page: unknown) => void;
  const operation = vi.fn(async (id: string, input: any) => {
    if (id === "First" && !input.cursor)
      return await new Promise((resolve) => (resolveFirst = resolve));
    return {
      items: [item(id, input.cursor ? "Third title" : "Second title")],
      next_cursor: null,
    };
  });
  const state = discoveryState();
  state.selected = ["First", "Second"];
  state.query = "original";
  state.layout = "list";
  render(Discovery, {
    client: { operation } as unknown as EngineClient,
    sources: [source("First"), source("Second"), source("Unused")],
    state,
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
    accounts: {},
    languages: "en",
  });
  await fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(
      operation.mock.calls.filter(
        (call) =>
          (call[1] as any)?.operation !== "collection" &&
          (call[1] as any)?.operation !== "details",
      ),
    ).toHaveLength(2),
  );
  expect(
    operation.mock.calls
      .filter((call) => (call[1] as any)?.operation !== "collection")
      .map(([id]) => id),
  ).toEqual(["First", "Second"]);
  await screen.findByText("Second title");
  resolveFirst({ items: [item("First", "First title")], next_cursor: "next" });
  await screen.findByText("First title");
  await screen.findByText("Third title");
  expect(
    [...document.querySelectorAll(".result-title strong")].map(
      (e) => e.textContent,
    ),
  ).toEqual(["Second title", "First title", "Third title"]);
  expect(screen.queryByRole("searchbox")).toBeNull();

  await screen.findByText("Third title");
  expect(
    operation.mock.calls.filter(
      (call) =>
        (call[1] as any)?.operation !== "collection" &&
        (call[1] as any)?.operation !== "details",
    )[2],
  ).toMatchObject([
    "First",
    { query: "original", cursor: "next", policy: { languages: ["en"] } },
  ]);
});
it("keeps successful results when a source fails and resolves pasted URLs without searching", async () => {
  const operation = vi.fn(async (id: string, _input: any) => {
    if (id === "Second") throw new Error("Source temporarily unavailable");
    return { items: [item(id, "Available title")], next_cursor: null };
  });
  const state = discoveryState();
  state.selected = ["First", "Second"];
  state.query = "title";
  const onlink = vi.fn();
  render(Discovery, {
    client: { operation } as unknown as EngineClient,
    sources: [source("First"), source("Second")],
    state,
    oncollection: vi.fn(),
    onlink,
    onsources: vi.fn(),
    accounts: {},
    languages: "en",
  });
  await fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await screen.findByText("Available title");
  expect(screen.getByText(/Source temporarily unavailable/).closest(".toast")?.textContent).toContain(
    "Source temporarily unavailable",
  );
  await fireEvent.click(
    screen.getByRole("button", { name: "Edit search fixture" }),
  );
  await fireEvent.input(screen.getByRole("searchbox"), {
    target: { value: "https://example.org/item" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Open link" }));
  expect(onlink).toHaveBeenCalledWith("https://example.org/item");
  expect(
    operation.mock.calls.filter(
      (call) =>
        (call[1] as any)?.operation !== "collection" &&
        (call[1] as any)?.operation !== "details",
    ),
  ).toHaveLength(2);
});
it("exposes provider discovery feeds and real advanced filters, with an explicit basic-version state", async () => {
  const advanced = source("Advanced");
  advanced.manifest.capabilities.push("discovery");
  const operation = vi.fn(async (_id: string, input: any) =>
    input.operation === "discovery"
      ? {
          feeds: [{ id: "new", label: "New additions" }],
          sorts: [{ id: "rating", label: "Highest rated" }],
          filters: [
            {
              id: "include_tags",
              label: "Include tags",
              multiple: true,
              options: [{ id: "mystery", label: "Mystery" }],
            },
          ],
        }
      : { items: [], next_cursor: null },
  );
  const state = discoveryState();
  state.selected = ["Advanced", "Basic"];
  state.query = "fixture";
  render(Discovery, {
    client: { operation } as unknown as EngineClient,
    sources: [advanced, source("Basic")],
    state,
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
    accounts: {},
    languages: "de",
  });
  await fireEvent.click(
    screen.getByRole("button", { name: "Advanced search" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Basic" }));
  expect(
    screen.getByText(/This installed version offers basic search only/),
  ).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  await fireEvent.click(
    screen.getByRole("button", { name: "Include tags: Any" }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Mystery" }));
  await fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() =>
    expect(operation).toHaveBeenCalledWith(
      "Advanced",
      expect.objectContaining({
        discovery: expect.objectContaining({
          filters: { include_tags: ["mystery"] },
        }),
        policy: { languages: ["de"] },
      }),
    ),
  );
});
it("reloads discovery capabilities when an installed provider is updated", async () => {
  const initial = source("Catalog");
  initial.manifest.capabilities.push("discovery");
  const operation = vi
    .fn()
    .mockResolvedValueOnce({
      feeds: [{ id: "old", label: "Old feed" }],
      sorts: [],
      filters: [],
    })
    .mockResolvedValueOnce({
      feeds: [{ id: "new", label: "Updated feed" }],
      sorts: [],
      filters: [],
    });
  const state = discoveryState();
  state.selected = ["Catalog"];
  state.query = "fixture";
  const props = {
    client: { operation } as unknown as EngineClient,
    sources: [initial],
    state,
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
    accounts: {},
    languages: "en",
  };
  const { rerender } = render(Discovery, props);
  await waitFor(()=>expect(operation).toHaveBeenCalledTimes(1));
  await rerender({
    ...props,
    sources: [{ manifest: { ...initial.manifest, version: "0.4.0" } }],
  });
  await waitFor(()=>expect(operation).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Old feed" })).toBeNull();
  expect(
    operation.mock.calls.filter(
      (call) =>
        (call[1] as any)?.operation !== "collection" &&
        (call[1] as any)?.operation !== "details",
    ),
  ).toHaveLength(2);
});

it("starts with an explicit browsing home and loads the selected source catalog on entry", async () => {
  const operation = vi.fn(async () => ({
    items: [item("Catalog", "A real result")],
    next_cursor: null,
  }));
  const state = discoveryState();
  state.selected = ["Catalog"];
  render(Discovery, {
    client: { operation } as unknown as EngineClient,
    sources: [source("Catalog")],
    state,
    oncollection: vi.fn(),
    onlink: vi.fn(),
    onsources: vi.fn(),
    accounts: {},
    languages: "en",
  });
  expect(screen.queryByText("End of results")).toBeNull();
  await screen.findByText("A real result");
  expect(operation).toHaveBeenCalledWith(
    "Catalog",
    expect.objectContaining({ operation: "browse", page_size: 48 }),
  );
});
it("reloads account-specific browse feeds and drops them on return to public access",async()=>{
 const catalog=source("ExampleVideo");catalog.manifest.capabilities.push("discovery");
 const operation=vi.fn(async(_id:string,input:any)=>input.operation==="browse"?{items:[],next_cursor:null}:({filters:[],sorts:[],feeds:input.credential_profile?[{id:"subscriptions",label:"Subscriptions"}]:[{id:"home",label:"Home"}]}));
 const state=discoveryState();state.selected=["ExampleVideo"];
 const props={client:{operation} as unknown as EngineClient,sources:[catalog],state,oncollection:vi.fn(),onlink:vi.fn(),onsources:vi.fn(),accounts:{} as Record<string,string|null>,languages:"en"};
 const view=render(Discovery,props);await screen.findByRole("button",{name:"Feed: Source default"});
 await view.rerender({...props,accounts:{ExampleVideo:"signed-in"}});
 await waitFor(()=>expect(operation).toHaveBeenCalledWith("ExampleVideo",{operation:"discovery",credential_profile:"signed-in"}));expect(operation).toHaveBeenCalledWith("ExampleVideo",{operation:"discovery",credential_profile:"signed-in"});
 await view.rerender({...props,accounts:{ExampleVideo:null}});await waitFor(()=>expect(operation.mock.calls.filter(([,input])=>input.operation==="discovery"&&input.credential_profile===null)).toHaveLength(2));
});

it("opens the episode catalog for a source exposing one browsable collection",async()=>{
 const oncollection=vi.fn();const operation=vi.fn(async()=>({items:[item("Podcast","show")],next_cursor:null}));
 render(Discovery,{client:{operation} as unknown as EngineClient,sources:[source("Podcast")],state:discoveryState(),oncollection,onlink:vi.fn(),onsources:vi.fn(),accounts:{},languages:"en"});
 await fireEvent.click(await screen.findByRole("button",{name:/show/}));
 await waitFor(()=>expect(oncollection).toHaveBeenCalledWith(expect.objectContaining({title:"show"})));
 expect(operation).toHaveBeenCalledWith("Podcast",expect.objectContaining({operation:"browse",query:""}));
});

it("does not fetch catalogs while Explore is hidden",async()=>{
 const operation=vi.fn(async()=>({items:[item("Catalog","Visible catalog")],next_cursor:null}));
 const props={client:{operation} as unknown as EngineClient,sources:[source("Catalog")],state:discoveryState(),oncollection:vi.fn(),onlink:vi.fn(),onsources:vi.fn(),accounts:{},languages:"en",enabled:false};
 const view=render(Discovery,props);await new Promise(r=>setTimeout(r,20));expect(operation).not.toHaveBeenCalled();
 await view.rerender({...props,enabled:true});await screen.findByText("Visible catalog");expect(operation).toHaveBeenCalledTimes(1);
});

it("hides redundant source choice and unsupported filters for one basic media plugin",async()=>{
 const basic=source("Podcast");basic.manifest.media_tools=true;
 const operation=vi.fn(async()=>({items:[item("Podcast","A show")],next_cursor:null}));
 render(Discovery,{client:{operation} as unknown as EngineClient,sources:[basic],state:discoveryState(),oncollection:vi.fn(),onlink:vi.fn(),onsources:vi.fn(),accounts:{},languages:"en"});
 await screen.findByText("A show");expect(screen.queryByRole("button",{name:/^Sources:/})).toBeNull();expect(screen.queryByRole("button",{name:"Advanced search"})).toBeNull();
 await fireEvent.input(screen.getByRole("searchbox"),{target:{value:"Apollo"}});expect(screen.queryByRole("button",{name:/^Sources:/})).toBeNull();expect(screen.queryByRole("button",{name:"Advanced search"})).toBeNull();
});
it("shows source choice before typing with multiple providers and searches only the chosen provider",async()=>{
 const operation=vi.fn(async(_id:string,_input:any)=>({items:[],next_cursor:null}));
 render(Discovery,{client:{operation} as unknown as EngineClient,sources:[source("First"),source("Second")],state:discoveryState(),oncollection:vi.fn(),onlink:vi.fn(),onsources:vi.fn(),accounts:{},languages:"en"});
 await fireEvent.click(await screen.findByRole("button",{name:"Sources: First"}));
 const choices=within(screen.getByRole("group",{name:"Sources"}));
 await fireEvent.click(choices.getByRole("button",{name:"Select only Second"}));
 await fireEvent.input(screen.getByRole("searchbox"),{target:{value:"planets"}});await fireEvent.click(screen.getByRole("button",{name:"Search"}));
 await waitFor(()=>expect(operation.mock.calls.filter(([,input])=>input.operation==="search")).toHaveLength(1));
 expect(operation).toHaveBeenCalledWith("Second",expect.objectContaining({operation:"search",query:"planets"}));
});
it("shows real filters and sorting for a single capable media provider and sends their selected values",async()=>{
 const advanced=source("Advanced");advanced.manifest.media_tools=true;advanced.manifest.capabilities.push("discovery");
 const operation=vi.fn(async(_id:string,input:any)=>input.operation==="discovery"?{feeds:[],sorts:[{id:"recent",label:"Newest first"}],filters:[{id:"type",label:"Media type",multiple:false,options:[{id:"audio",label:"Audio"}]}]}:{items:[],next_cursor:null});
 render(Discovery,{client:{operation} as unknown as EngineClient,sources:[advanced],state:discoveryState(),oncollection:vi.fn(),onlink:vi.fn(),onsources:vi.fn(),accounts:{},languages:"en"});
 await fireEvent.click(await screen.findByRole("button",{name:"Advanced search"}));
 await fireEvent.click(await screen.findByRole("button",{name:"Media type: Source default"}));await fireEvent.click(screen.getByRole("button",{name:"Audio"}));
 await fireEvent.click(screen.getByRole("button",{name:"Sort by: Source default"}));await fireEvent.click(screen.getByRole("button",{name:"Newest first"}));
 await fireEvent.input(screen.getByRole("searchbox"),{target:{value:"space"}});await fireEvent.click(screen.getByRole("button",{name:"Search"}));
 await waitFor(()=>expect(operation).toHaveBeenCalledWith("Advanced",expect.objectContaining({operation:"search",discovery:{filters:{type:["audio"]},sort:"recent",feed:null}})));
});
it("keeps feed-only discovery choices accessible while searching",async()=>{
 const advanced=source("Feeds");advanced.manifest.media_tools=true;advanced.manifest.capabilities.push("discovery");const state=discoveryState();state.query="space";
 const operation=vi.fn(async(_id:string,input:any)=>input.operation==="discovery"?{feeds:[{id:"new",label:"Recent uploads"}],sorts:[],filters:[]}:{items:[],next_cursor:null});
 render(Discovery,{client:{operation} as unknown as EngineClient,sources:[advanced],state,oncollection:vi.fn(),onlink:vi.fn(),onsources:vi.fn(),accounts:{},languages:"en"});
 await fireEvent.click(await screen.findByRole("button",{name:"Advanced search"}));await fireEvent.click(await screen.findByRole("button",{name:"Browse: Source default"}));await fireEvent.click(screen.getByRole("button",{name:"Recent uploads"}));
 await fireEvent.click(screen.getByRole("button",{name:"Search"}));await waitFor(()=>expect(operation).toHaveBeenCalledWith("Feeds",expect.objectContaining({discovery:expect.objectContaining({feed:"new"})})));
});
