<script lang="ts">
  import { sectionPage } from "./sectionCache";
  import CatalogBrowser from "./CatalogBrowser.svelte";
  import TagPicker from './TagPicker.svelte';
  import ImageDownloadDialog from './ImageDownloadDialog.svelte';
  import { imageKey, imageCount, toggleImageSelection } from './imageSelection';
  import type { Destination } from './client';
  import { Download } from 'lucide-svelte';
  import Toast from "./ui/Toast.svelte";
  import { ReadRetry, isTransientSourceError } from "./readRetry";
  import EmptyState from "./ui/EmptyState.svelte";
  import Button from "./ui/Button.svelte";
  import ResultBrowser from "./ResultBrowser.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import { onDestroy, untrack } from "svelte";
  import { Search, SlidersHorizontal, AlertCircle } from "lucide-svelte";
  import type {
    EngineClient,
    Collection,
    ProviderManifest,
    Page,
    DiscoverySchema,
    DiscoveryQuery,
  } from "./client";
  import type { DiscoveryState } from "./discoveryState";
  import { mergeSourcePages, sourceIssueMessage } from "./discoveryState";
  import AccountPicker from "./AccountPicker.svelte";
  import ChoicePicker from "./ChoicePicker.svelte";
  import LanguagePicker from "./LanguagePicker.svelte";
  let {
    client,
    oncontrols,
    sources,
    state: model,
    oncollection,
    onimagedownload,
    destinations = [],
    onlink,
    onsources,
    empty,
    accounts,
    languages,
    accountRevision = 0,
    enabled = true,
  }: {
    client: EngineClient;
    oncontrols?: (controls: import("svelte").Snippet | undefined) => void;
    sources: { manifest: ProviderManifest }[];
    state: DiscoveryState;
    oncollection: (c: Collection) => void;
    onimagedownload?: (items: Collection[], destination: string) => Promise<void>;
    destinations?: Destination[];
    onlink: (url: string) => void;
    onsources: () => void;
    /** Starts the reviewed .omdp import when no source plugin is installed. */
    /** Shown instead of search while no source plugin is installed. */
    empty?: import("svelte").Snippet;
    accounts: Record<string, string | null>;
    languages: string;
    accountRevision?: number;
    enabled?: boolean;
  } = $props();
  let tagsOpen=$state(false);
  export function searchTags(provider:string,tags:string[]){model.selected=[provider];model.query=tags.join(' ');model.options[provider]={...model.options[provider],feed:null};void search();}
  let imageSelection = $state(new Set<string>()), imageAnchor: string | null = null;
  let downloadImages = $state(false);
  const imageItems = $derived(model.results.filter(item => !!item.summary?.image));
  const selectedImages = $derived(imageItems.filter(item => imageSelection.has(imageKey(item))));
  function toggleImage(item: Collection, range = false) {
    const key = imageKey(item);
    imageSelection = toggleImageSelection(imageItems, imageSelection, key, imageAnchor, range); imageAnchor = key;
  }
  function openResult(item: Collection) { oncollection(item); }
  const retries = new ReadRetry();
  const reported = new Set<string>();
  let sourceToast = $state<{ id: string; message: string } | null>(null);
  function failed(id: string, error: unknown) {
    model.issues[id] = message(error);
    const version = generation;
    const automatic =
      isTransientSourceError(error) &&
      retries.schedule(id, () => {
        if (version === generation && !stopped) void retrySource(id);
      });
    if (!reported.has(id) || !automatic) {
      reported.add(id);
      sourceToast = {
        id,
        message: sourceIssueMessage(sourceName(id), message(error), automatic),
      };
    }
  }
  function sourceName(id: string) {
    return sources.find((s) => s.manifest.id === id)?.manifest.name ?? id;
  }
  function recovered(id: string) {
    delete model.issues[id];
    retries.reset(id);
    reported.delete(id);
    if (sourceToast?.id === id) sourceToast = null;
  }
  function resetRetries() {
    retries.clear();
    reported.clear();
    sourceToast = null;
  }
  function manualRetry(id: string) {
    retries.reset(id);
    reported.delete(id);
    void retrySource(id);
  }
  $effect(() => {
    const paused = !enabled || (model.editing && model.searched);
    untrack(() => retries.pause(paused));
  });
  let stopped = false;
  let inFlight = $state<string[]>([]);
  let initialized = false;
  let requests: Promise<void>[] = [];
  let loading = $state(false),
    generation = 0;
  const continuation = $derived(
    Object.entries(model.cursors).some(
      ([id, cursor]) => cursor && !model.issues[id],
    )
      ? JSON.stringify({ applied: model.applied, cursors: model.cursors })
      : null,
  );
  let schemaLoading = $state<string[]>([]);
  let filterSource = $state("");
  $effect(() => {
    if (model.languages === null) model.languages = languages;
  });
  const selectedSources = $derived(
    sources.filter((s) => model.selected.includes(s.manifest.id)),
  );
  const browseHome = $derived(model.editing && !model.query.trim() && !model.filtersOpen);
  const searchableSources = $derived(sources.filter(s=>s.manifest.capabilities.some(c=>c==="search" || c==="browse")));
  const hasTags = $derived(selectedSources.some(s=>model.schemas[s.manifest.id]?.tag_search));
  const hasFilters = $derived(selectedSources.some(s=>{
    const schema=model.schemas[s.manifest.id];
    return schema ? !!(schema.filters.length || schema.sorts.length || schema.feeds.length || (!s.manifest.media_tools && !schema.tag_search))
      : s.manifest.capabilities.includes("discovery") && !model.issues[s.manifest.id];
  }));
  const isLink = $derived(/^https?:\/\//i.test(model.query.trim()));
  $effect(() => {
    const available = sources
      .filter((s) =>
        s.manifest.capabilities.some((c) => c === "search" || c === "browse"),
      )
      .map((s) => s.manifest.id);
    untrack(() => {
      model.selected = model.selected.filter((id) => available.includes(id));
      if (!initialized && available.length) {
        initialized = true;
        if (
          !model.selected.length &&
          localStorage.getItem("omd.search-sources") === null
        )
          model.selected = [available[0]];
      }
    });
  });
  $effect(() => {
    const revisions = selectedSources.map((s) => [
      s.manifest.id,
      s.manifest.version,
      JSON.stringify([accounts[s.manifest.id] ?? null, accountRevision]),
    ]);
    untrack(() => {
      for (const [id, version, account] of revisions) {
        if (
          (model.schemaVersions[id] && model.schemaVersions[id] !== version) ||
          model.schemaAccounts[id] !== account
        ) {
          delete model.schemas[id];
          delete model.options[id];
          delete model.schemaVersions[id];
          recovered(id);
        }
        model.schemaAccounts[id] = account;
      }
    });
  });
  $effect(() => {
    void schemaLoading;
    const ids = (enabled ? browseHome ? selectedSources.slice(0,1) : selectedSources : [])
      .filter(
        (s) =>
          s.manifest.capabilities.includes("discovery") &&
          !model.schemas[s.manifest.id] &&
          !model.issues[s.manifest.id],
      )
      .map((s) => s.manifest.id);
    untrack(() => {
      for (const id of ids) void loadSchema(id);
    });
  });
  const pending = new Set<string>();
  async function loadSchema(id: string) {
    if (pending.has(id)) return;
    const version = sources.find((s) => s.manifest.id === id)?.manifest.version;
    const account = accounts[id] ?? null;
    const revision = accountRevision;
    pending.add(id);
    schemaLoading = [...pending];
    try {
      const result = await client.operation<DiscoverySchema>(id, {
        operation: "discovery",
        credential_profile: account,
      });
      if (
        version ===
          sources.find((s) => s.manifest.id === id)?.manifest.version &&
        account === (accounts[id] ?? null) &&
        revision === accountRevision
      ) {
        model.schemas[id] = result;
        model.schemaVersions[id] = version ?? "";
        recovered(id);
      }
    } catch (e) {
      failed(id, e);
    } finally {
      pending.delete(id);
      schemaLoading = [...pending];
    }
  }
  function message(e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  async function retrySource(id: string) {
    const applied = model.applied[id];
    if (!applied) {
      await loadSchema(id);
      return;
    }
    if (inFlight.includes(id)) return;
    const current = generation;
    const cursor = model.cursors[id] ?? null;
    inFlight = [...inFlight, id];
    loading = true;
    try {
      const page = await client.operation<Page<Collection>>(id, {
        ...applied,
        cursor,
      } as Parameters<EngineClient["operation"]>[1]);
      if (current !== generation) return;
      if (page.next_cursor && page.next_cursor === cursor)
        throw new Error(
          "The source repeated a results page. Update the source and retry.",
        );
      model.results = mergeSourcePages(model.results, [
        { provider: id, items: page.items },
      ]);
      model.cursors[id] = page.next_cursor;
      recovered(id);
    } catch (e) {
      if (current === generation) failed(id, e);
    } finally {
      if (current === generation) {
        inFlight = inFlight.filter((value) => value !== id);
        loading = inFlight.length > 0;
      }
    }
  }
  function options(
    id: string,
  ): DiscoveryQuery & { filters: Record<string, string[]> } {
    const value = model.options[id];
    return {
      ...value,
      filters: value?.filters ?? {},
      sort: value?.sort ?? null,
      feed: value?.feed ?? null,
    };
  }
  function filter(id: string, key: string, values: string[]) {
    model.options[id] = {
      ...options(id),
      filters: { ...options(id).filters, [key]: values },
    };
  }
  function choice(id: string, key: "sort" | "feed", value: string) {
    model.options[id] = { ...options(id), [key]: value || null };
  }
  export async function openSavedSearch(sub: import("./client").Subscription) {
    if (!sub.request.search) return;
    const id = sub.request.target.provider;
    model.selected = [id];
    model.query = sub.request.search.query;
    model.languages = (sub.request.policy.languages ?? []).join(",");
    model.schemaAccounts[id] = JSON.stringify([accounts[id] ?? null, accountRevision]);
    model.options[id] = structuredClone($state.snapshot(sub.request.search.discovery ?? {filters:{},sort:null,feed:null}));
    await search();
  }
  function resetFilters() {
    for (const source of selectedSources)
      model.options[source.manifest.id] = {
        filters: {},
        sort: null,
        feed: null,
      };
    model.languages = languages;
  }

  async function search(more = false, size = 60) {
    if (isLink && !more) {
      onlink(model.query.trim());
      return;
    }
    if (!more) {
      resetRetries();
      generation++;
      imageSelection = new Set(); imageAnchor = null;
      model.results = [];
      model.cursors = {};
      model.issues = {};
      model.applied = {};
      model.searched = true;
      model.editing = false;
      model.galleryIndex = 0;
      inFlight = [];
      requests = [];
      document.querySelector(".v2-main")?.scrollTo({ top: 0 });
    }
    const version = generation;
    const selected = selectedSources.filter(
      (s) =>
        !inFlight.includes(s.manifest.id) &&
        (!more ||
          (model.cursors[s.manifest.id] && !model.issues[s.manifest.id])),
    );
    const tasks = selected.map(async (s) => {
      const id = s.manifest.id;
      inFlight = [...inFlight, id];
      loading = true;
      if (!more)
        model.applied[id] = {
          operation: model.query.trim() ? "search" : "browse",
          query: model.query.trim(),
          page_size: size,
          credential_profile: accounts[id] ?? null,
          policy: {
            languages: (model.languages ?? languages)
              .split(",")
              .filter(Boolean),
          },
          discovery: structuredClone($state.snapshot(options(id))),
        };
      try {
        const page = await sectionPage<Collection>(client,id, {
          ...model.applied[id],
          page_size: size,
          cursor: more ? model.cursors[id] : null,
        } as Parameters<EngineClient["operation"]>[1],s.manifest.version);
        if (version !== generation) return;
        if (more && page.next_cursor && page.next_cursor === model.cursors[id])
          throw new Error(
            "The source repeated a results page. Update the source and retry.",
          );
        model.results = mergeSourcePages(model.results, [
          { provider: id, items: page.items },
        ]);
        model.cursors[id] = page.next_cursor;
        recovered(id);
      } catch (e) {
        if (version === generation) failed(id, e);
      } finally {
        if (version === generation) {
          inFlight = inFlight.filter((v) => v !== id);
          loading = inFlight.length > 0;
        }
      }
    });
    // Each source publishes immediately. Continuation can advance a ready source
    // while another source is still fetching its first page.
    requests.push(...tasks);
    for (const task of tasks)
      void task.finally(() => {
        requests = requests.filter((p) => p !== task);
      });
    await Promise.race(
      tasks.length ? tasks : requests.length ? requests : [Promise.resolve()],
    );
  }
  onDestroy(() => {
    resetRetries();
    stopped = true;
    generation++;
  });
</script>

<div class="search-workspace">
  <!-- Search and links run through installed source plugins; with none, the
       prerequisite below replaces an inert search field. -->
  {#if model.editing && sources.length}
    <form
      class="search-form"
      onsubmit={(e) => {
        e.preventDefault();
        void search();
      }}
    >
      <div class="discovery-search">
        <Search size={18} /><label class="v2-grow"
          ><span class="sr-only">Search or paste a link</span><input
            type="search"
            bind:value={model.query}
            placeholder="Search or paste a link"
          /></label
        >
      </div>
      <Button
        type="submit"
        class="search-submit"
        variant="primary"
        disabled={!isLink && !selectedSources.length}
        >{isLink ? "Open link" : "Search"}</Button
      >
    </form>
    {#if searchableSources.length>1 || hasFilters || hasTags}
      <div class="discovery-tools">
        {#if hasTags}<Button variant="ghost" onclick={()=>tagsOpen=true}>Find tags</Button>{/if}
        {#if searchableSources.length>1}<ChoicePicker
          label="Sources"
          compact
          options={searchableSources.map(s=>({id:s.manifest.id,label:s.manifest.name}))}
          empty="Choose sources"
          bind:value={
            () => model.selected,
            (value) => {
              resetRetries();
              model.selected = value;
              generation++;
              inFlight = [];
              loading = false;
              model.results = [];
              model.cursors = {};
              model.searched = false;
              model.issues = {};
              localStorage.setItem("omd.search-sources", JSON.stringify(value));
            }
          }
        />{/if}
        {#if hasFilters}<Button
          type="submit"
          class="filter-toggle"
          variant="ghost"
          aria-label="Advanced search"
          aria-expanded={model.filtersOpen}
          onclick={() => (model.filtersOpen = !model.filtersOpen)}
          ><SlidersHorizontal
            size={16}
          />Filters{#if Object.values(model.options).some( (o) => Object.values(o.filters ?? {}).some((v) => v.length), )}<span
              class="filter-dot"
            ></span>{/if}</Button
        >{/if}
      </div>
      {#if model.filtersOpen}<section
          class="discovery-filters"
          aria-label="Advanced search"
        >
          <div class="filter-heading">
            <h2>Refine search</h2>
            <Button type="submit" onclick={resetFilters}>Reset</Button>
          </div>

          {#if selectedSources.length > 1}<div
              class="filter-source-tabs"
              role="group"
              aria-label="Source filters"
            >
              {#each selectedSources as source}<button
                  aria-pressed={(filterSource ||
                    selectedSources[0]?.manifest.id) === source.manifest.id}
                  onclick={() => (filterSource = source.manifest.id)}
                  >{source.manifest.name}</button
                >{/each}
            </div>{/if}
          {#each selectedSources.filter((s) => selectedSources.length === 1 || s.manifest.id === (selectedSources.some((s) => s.manifest.id === filterSource) ? filterSource : selectedSources[0]?.manifest.id)) as source}{@const id =
              source.manifest.id}{@const schema = model.schemas[id]}
            {#if schema}<div class="discovery-filter-grid">
                {#if !source.manifest.media_tools && !schema.tag_search}<LanguagePicker
                    bind:value={
                      () => model.languages ?? languages,
                      (value) => (model.languages = value)
                    }
                    label="Translation language"
                  />{/if}
                {#if schema.feeds.length}<SelectPicker
                    label="Browse"
                    value={options(id).feed ?? ""}
                    options={[
                      { id: "", label: "Source default" },
                      ...schema.feeds,
                    ]}
                    onchange={(v) => choice(id, "feed", v)}
                  />{/if}
                {#if schema.sorts.length}<SelectPicker
                    label="Sort by"
                    value={options(id).sort ?? ""}
                    options={[
                      { id: "", label: "Source default" },
                      ...schema.sorts,
                    ]}
                    onchange={(v) => choice(id, "sort", v)}
                  />{/if}
                {#each schema.filters as f}<ChoicePicker
                    label={f.label}
                    options={f.multiple
                      ? f.options
                      : [{ id: "", label: "Source default" }, ...f.options]}
                    multiple={f.multiple}
                    empty={f.multiple ? "Any" : "Source default"}
                    bind:value={
                      () =>
                        options(id).filters[f.id]?.length
                          ? options(id).filters[f.id]
                          : f.multiple
                            ? []
                            : [""],
                      (v) => filter(id, f.id, v.filter(Boolean))
                    }
                  />{/each}
              </div>{:else if schemaLoading.includes(id)}<div
                class="filter-skeleton"
                aria-label="Loading filters"
                role="status"
              ></div>{:else}<p class="source-limits">
                This installed version offers basic search only. <Button
                  type="submit"
                  onclick={onsources}>Check source updates</Button
                >
              </p>{/if}
            {#if source.manifest.grants.some((g) => g.credential)}<AccountPicker
                {client}
                provider={id}
                bind:value={accounts[id]}
                revision={accountRevision}
              />{/if}
          {/each}
        </section>{/if}
    {/if}
  {/if}
</div>
{#if enabled && sourceToast}<Toast
    kind="error"
    message={sourceToast.message}
    dismissLabel="Dismiss source notification"
    onclose={() => (sourceToast = null)}
  />{/if}
{#snippet imageCheckbox(item: Collection)}{#if item.summary?.image}<label class="image-select"><input type="checkbox" aria-label={`Select ${item.title}`} checked={imageSelection.has(imageKey(item))} onclick={(event) => toggleImage(item, event.shiftKey)} />{imageSelection.has(imageKey(item)) ? 'Selected' : item.summary.image.count > 1 ? `Select post · ${item.summary.image.count} images` : 'Select image'}</label>{/if}{/snippet}
{#if !model.editing && imageItems.length}<div class="image-selection-bar" aria-label="Image selection">
  <div class="selection-count" aria-live="polite">{#if selectedImages.length}<strong>{selectedImages.length} selected</strong><span>{imageCount(selectedImages)} images</span>{:else}<span>Select images to download together</span>{/if}</div>
  <div class="image-batch-actions"><Button variant="ghost" onclick={() => imageSelection = new Set(imageItems.map(imageKey))}>Select loaded</Button>{#if selectedImages.length}<Button variant="ghost" onclick={() => imageSelection = new Set()}>Clear</Button>{/if}<Button variant="primary" disabled={!selectedImages.length || !onimagedownload} onclick={() => downloadImages = true}><Download size={16}/>Download selected</Button></div>
</div>{/if}
{#if enabled && downloadImages && onimagedownload}<ImageDownloadDialog items={selectedImages} {destinations} onclose={() => downloadImages = false} onstart={async (items, destination) => { await onimagedownload!(items, destination); imageSelection = new Set(); }}/>{/if}
{#if !model.editing && model.searched}<ResultBrowser
    {oncontrols}
    enabled={enabled && !model.editing}
    {accounts}
    {languages}
    manifests={Object.fromEntries(
      sources.map((s) => [s.manifest.id, s.manifest]),
    )}
    items={model.results}
    {client}
    layout={model.layout}
    bind:active={model.galleryIndex}
    sources={Object.fromEntries(
      selectedSources.map((s) => [s.manifest.id, s.manifest.name]),
    )}
    {loading}
    hasMore={!!continuation || loading}
    onmore={(count) => search(true, count)}
    oncollection={openResult}
    ontagsearch={(provider,tag)=>searchTags(provider,[tag])}
    selection={imageItems.length ? imageCheckbox : undefined}
  />{/if}
{#if !model.editing && !loading && Object.keys(model.issues).length}
  {#if !model.results.length}<EmptyState
      icon={AlertCircle}
      title={Object.keys(model.issues).length === 1
        ? `Couldn’t load results from ${sourceName(Object.keys(model.issues)[0])}`
        : "Couldn’t load results"}
      description="Check your connection, then try again."
    >
      <Button onclick={() => Object.keys(model.issues).forEach(manualRetry)}
        >Retry search</Button
      >
    </EmptyState>{:else}<div class="result-retry">
      <Button
        variant="ghost"
        onclick={() => Object.keys(model.issues).forEach(manualRetry)}
        >Load more results</Button
      >
    </div>{/if}
{/if}
{#if !sources.length}{#if enabled}{@render empty?.()}{/if}
{:else if browseHome && enabled}
  <CatalogBrowser {client} sources={sources.filter(s=>s.manifest.capabilities.some(c=>c==="browse"||c==="search"))} selected={model.selected[0]??""}
    onselect={(id)=>{model.selected=[id];localStorage.setItem("omd.search-sources",JSON.stringify([id]));}}
    {oncollection} onsearch={()=>document.querySelector<HTMLInputElement>('.search-form input')?.focus()}
    bind:directory={model.catalog}
    {accounts} languages={model.languages??languages} schemas={model.schemas} options={model.options}
    onfeed={(id,feed)=>choice(id,"feed",feed)} {accountRevision}/>

{:else if !model.editing && !model.results.length && !loading && !Object.keys(model.issues).length}<EmptyState
    icon={Search}
    title="No matching titles"
    description={continuation
      ? "No matches on this page. More results are available."
      : "Try another search or adjust your filters."}
  >
    {#if continuation}<Button onclick={() => search(true)}
        >Load more results</Button
      >{/if}
    <Button
      onclick={() => {
        model.editing = true;
      }}>Edit search</Button
    >
  </EmptyState>{/if}

<style>
  .image-selection-bar { position:sticky; top:0; z-index:3; background:var(--bg); display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; padding:12px 0; margin-bottom:16px; border-bottom:1px solid var(--line); }
  .selection-count,.image-batch-actions { display:flex; align-items:center; gap:12px; font-size:13px; }
  .selection-count span { color:var(--muted); }
  .image-batch-actions { flex-wrap:wrap; gap:8px; }
  .image-select { display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; padding:6px 0; }

  .result-retry {
    display: flex;
    justify-content: center;
    padding: var(--theme-discovery-padding-1, 16px);
  }
  .search-workspace {
    margin-bottom: 0;
  }
  .search-workspace:has(.search-form) {
    margin-bottom: var(--theme-discovery-margin-bottom-2, 24px);
  }
  .discovery-search {
    display: flex;
    align-items: center;
    gap: var(--theme-discovery-gap-3, 12px);
    border: var(--theme-discovery-border-4, 1px) solid var(--line-strong);
    border-radius: var(--control-radius);
    background: var(--surface-raised);
    padding: 0 var(--theme-discovery-padding-5, 12px);
    flex: 1;
    min-width: 0;
    box-shadow: 0 var(--theme-discovery-box-shadow-6, 2px) var(--theme-discovery-box-shadow-7, 8px) var(--theme-discovery-box-shadow-8, #00000008);
  }
  .discovery-search > :global(svg) {
    color: var(--muted);
    flex-shrink: 0;
  }
  .discovery-search label {
    margin: 0;
  }
  .discovery-search input {
    border: 0;
    background: transparent;
    height: calc(var(--control-height) - var(--theme-discovery-height-9, 2px));
    min-height: 0;
    font-size: var(--type-control);
    padding: 0;
    width: 100%;
    outline: none !important;
    box-shadow: none !important;
  }
  .search-form {
    display: flex;
    align-items: stretch;
    gap: var(--theme-discovery-gap-10, 10px);
  }
  .discovery-search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 var(--theme-discovery-box-shadow-11, 1px) var(--accent);
  }

  .discovery-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--theme-discovery-gap-12, 8px);
    margin-top: var(--theme-discovery-margin-top-13, 12px);
    min-width: 0;
  }

  .discovery-tools > :global(.choice-picker) { flex: 0 1 360px; width: min(360px, 100%); max-width: 100%; }
  .discovery-tools > :global(.ui-button) { flex: 0 0 auto; }
  :global(.filter-toggle[aria-expanded="true"]) {
    color: var(--text);
    background: var(--surface-soft);
  }
  .filter-dot {
    width: var(--theme-discovery-width-14, 5px);
    height: var(--theme-discovery-height-15, 5px);
    background: var(--accent);
    border-radius: 50%;
  }
  .discovery-filters {
    margin-top: var(--theme-discovery-margin-top-16, 16px);
    padding: var(--theme-discovery-padding-1, 16px);
    border: var(--theme-discovery-border-4, 1px) solid var(--line);
    border-radius: var(--theme-discovery-border-radius-17, 12px);
    background: var(--surface);
    display: grid;
    gap: var(--theme-discovery-gap-18, 16px);
  }
  .filter-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .filter-heading h2 {
    font-size: var(--theme-discovery-font-size-19, 16px);
  }

  .filter-source-tabs {
    display: flex;
    gap: var(--theme-discovery-gap-20, 6px);
    border-bottom: var(--theme-discovery-border-bottom-21, 1px) solid var(--line);
    padding-bottom: var(--theme-discovery-padding-bottom-22, 10px);
  }
  .filter-source-tabs button {
    border: 0;
    background: transparent;
    min-height: var(--control-height);
    font-size: var(--theme-discovery-font-size-23, 13px);
  }
  .filter-source-tabs button[aria-pressed="true"] {
    background: var(--surface-soft);
    color: var(--accent-text);
  }
  .discovery-filter-grid {
    display: grid;
    
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--theme-discovery-gap-18, 16px);
    align-items: start;
  }

  .filter-skeleton {
    height: var(--theme-discovery-height-24, 100px);
    background: var(--surface-soft);
    border-radius: var(--theme-discovery-border-radius-25, 8px);
  }
  .source-limits {
    font-size: var(--theme-discovery-font-size-23, 13px);
  }
  .sr-only {
    position: absolute;
    width: var(--theme-discovery-width-30, 1px);
    height: var(--theme-discovery-height-31, 1px);
    overflow: hidden;
    clip-path: inset(50%);
  }
  @media (max-width: 900px) {
    .discovery-filter-grid {
      
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .discovery-tools {
      flex-wrap: wrap;
    }

    .discovery-search input {
      font-size: var(--theme-discovery-font-size-29, 14px);
    }
  }
</style>

{#if tagsOpen}<TagPicker {client} sources={selectedSources.filter(s=>model.schemas[s.manifest.id]?.tag_search).map(s=>({id:s.manifest.id,name:s.manifest.name}))} {accounts} onsearch={searchTags} onclose={()=>tagsOpen=false}/>{/if}
