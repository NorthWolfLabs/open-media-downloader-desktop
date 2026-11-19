<script lang="ts">
  import { appLocale } from "./locale";
  import {
    artworkKind, isAudioCollection,
    artworkPriority,
    durationLabel,
    publishedAge,
    type ArtworkPriority,
  } from "./mediaPresentation";
  import PendingStatus from "./ui/PendingStatus.svelte";
  import GalleryNavigation from "./GalleryNavigation.svelte";
  import type { Snippet } from "svelte";
  import { PendingPresentation } from "./ui/pendingPresentation";
  import ItemOverview from "./ItemOverview.svelte";
  import GalleryItem from "./GalleryItem.svelte";
  import Button from "./ui/Button.svelte";
  import { onDestroy, untrack } from "svelte";
  import SourceBadge from "./SourceBadge.svelte";
  import { truncatedTitle } from "./truncatedTitle";
  import { Star, Users } from "lucide-svelte";
  import Artwork from "./Artwork.svelte";
  import type { Collection, EngineClient, ProviderManifest } from "./client";
  import type { ResultLayout } from "./LayoutPicker.svelte";
  import { languageName } from "./languages";
  let {
    items,
    oncontrols,
    client,
    layout = "grid",
    sources = {},
    loading = false,
    hasMore = false,
    onmore,
    oncollection,
    ontagsearch,
    active = $bindable(0),
    enabled = true,
    onprefetch,
    accounts = {},
    manifests = {},
    languages = "",
    artwork = "auto",
    selection,
  }: {
    selection?: Snippet<[Collection]>;
    items: Collection[];
    oncontrols?: (controls: Snippet | undefined) => void;
    client: EngineClient;
    layout?: ResultLayout;
    sources?: Record<string, string>;
    loading?: boolean;
    hasMore?: boolean;
    onmore?: (count: number) => Promise<unknown>;
    oncollection: (item: Collection) => void;
    ontagsearch?: (provider:string,tag:string)=>void;
    active?: number;
    enabled?: boolean;
    onprefetch?: (items: Collection[]) => void;
    accounts?: Record<string, string | null>;
    manifests?: Record<string, ProviderManifest>;
    languages?: string;
    artwork?: ArtworkPriority | "auto";
  } = $props();
  $effect(() => {
    oncontrols?.(
      enabled && layout === "gallery" && !pendingResults && items.length
        ? navigation
        : undefined,
    );
  });
  onDestroy(() => oncontrols?.(undefined));
  let container: HTMLDivElement;
  let gallery = $state<HTMLDivElement>();
  let columnGap = $state(18);
  let width = $state(900),
    viewport = $state(750),
    galleryHeight = $state(600),
    scroll = $state(0),
    error = $state(""),
    fetching = $state(false),
    latency = $state(1000),
    velocity = 0,
    previousY = 0,
    previousTime = 0,
    alive = true;
  const priority = $derived(
    artwork === "auto"
      ? artworkPriority(items, manifests, Object.keys(sources))
      : artwork,
  );
  const audioOnly = $derived(items.length>0 && items.every(isAudioCollection));
  const mediaOnly = $derived(priority === "landscape" || priority === "banner");
  const initialLoading = $derived(loading && !items.length);
  let pendingLabel = $state("");
  const pending = new PendingPresentation((value) => (pendingLabel = value));
  $effect(() => pending.update(initialLoading ? "Loading results" : ""));
  onDestroy(() => pending.dispose());
  const pendingResults = $derived(initialLoading);

  const columns = $derived(
    layout === "list" || layout === "compact" || layout === "gallery"
      ? 1
      : Math.max(
          1,
          Math.floor(
            (width + columnGap) /
              ((mediaOnly ? 280 : priority === "equal" ? 220 : 178) + columnGap),
          ),
        ),
  );
  const tileWidth = $derived((width - (columns - 1) * columnGap) / columns);
  const rowHeight = $derived(
    layout === "compact"
      ? audioOnly ? 76 : 60
      : layout === "list"
        ? 150
        : Math.ceil(
            tileWidth * (priority === "banner" ? 1 / 6 : mediaOnly ? 9 / 16 : priority === "equal" ? 1 : 1.5),
          ) + (mediaOnly ? 112 : 178),
  );
  const placeholderCount = $derived(
    columns * Math.max(1, Math.ceil(galleryHeight / rowHeight)),
  );
  const count = $derived(
    hasMore && columns > 1 && items.length >= columns
      ? Math.floor(items.length / columns) * columns
      : items.length,
  );
  const rows = $derived(Math.ceil(count / columns));
  // Measure natural row heights: metadata must not be clipped to preserve a
  // fixed virtual row size. Keep estimated space for rows outside the window.
  let rowSizes = $state<Record<string, number>>({});
  const rowKeys = $derived(
    Array.from({ length: rows }, (_, row) =>
      JSON.stringify([
        layout,
        width,
        ...items
          .slice(row * columns, (row + 1) * columns)
          .map((item) => item.reference),
      ]),
    ),
  );
  const offsets = $derived.by(() => {
    const values = [0];
    for (const key of rowKeys)
      values.push(values.at(-1)! + (rowSizes[key] ?? rowHeight));
    return values;
  });
  const totalHeight = $derived(offsets.at(-1) ?? 0);
  function rowAt(y: number) {
    let low = 0,
      high = rows;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (offsets[middle + 1] <= y) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  const first = $derived(Math.max(0, rowAt(scroll) - 4));
  const last = $derived(Math.min(rows, rowAt(scroll + viewport) + 6));
  const visibleRows = $derived(
    Array.from(
      { length: Math.max(0, last - first) },
      (_, index) => first + index,
    ),
  );
  const visible = $derived(items.slice(first * columns, last * columns));
  let measurementTimer:ReturnType<typeof setTimeout>|undefined;
  let measurements:Record<string,number>={};
  function measureRow(node: HTMLDivElement, key: string) {
    const observer = new ResizeObserver(() => {
      const height=Math.ceil(node.getBoundingClientRect().height);
      if(!alive||height<=0)return;
      untrack(()=>{
        if(rowSizes[key]===height)return;
        measurements[key]=height;
        // Commit outside ResizeObserver delivery: mutating layout inside it can
        // generate another delivery in the same frame and make scrolling jank.
        if(measurementTimer===undefined)measurementTimer=setTimeout(()=>{
          measurementTimer=undefined;if(!alive)return;
          const keys=new Set(rowKeys);
          rowSizes=Object.fromEntries(Object.entries({...rowSizes,...measurements}).filter(([id])=>keys.has(id)));
          measurements={};
        },0);
      });
    });
    observer.observe(node);
    return {destroy:()=>observer.disconnect()};
  }
  onDestroy(()=>clearTimeout(measurementTimer));
  $effect(() => {
    if (enabled && !pendingResults && onprefetch)
      onprefetch(
        layout === "gallery" ? items.slice(active, active + 4) : visible,
      );
  });
  const batch = $derived(
    Math.min(100, columns * Math.max(8, Math.ceil(viewport / rowHeight) * 4)),
  );
  const ahead = $derived(
    Math.max(viewport * 4, Math.min(16000, velocity * (latency + 800))),
  );
  async function more() {
    if (!enabled || initialLoading || !hasMore || !onmore || fetching || error)
      return;
    fetching = true;
    const start = performance.now();
    try {
      await onmore(batch);
      if (alive) latency = Math.max(200, performance.now() - start);
    } catch (e) {
      if (alive) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (alive) fetching = false;
    }
  }
  function measure() {
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--theme-resultbrowser-column-gap-15"));
    columnGap = Number.isFinite(gap) ? gap : 18;
    if (!container) return;
    const root = container.closest(".v2-main,.v2-dialog-content");
    const rect = container.getBoundingClientRect();
    const r = root?.getBoundingClientRect();
    if (!rect.width || !enabled) return;
    width = rect.width;
    viewport = r?.height ?? window.innerHeight;
    galleryHeight = Math.max(
      300,
      (r?.bottom ?? window.innerHeight) -
        Math.max(rect.top, r?.top ?? 0) -
        (root ? parseFloat(getComputedStyle(root).paddingBottom) || 0 : 0),
    );
    scroll = Math.max(0, (r?.top ?? 0) - rect.top);
    const now = performance.now();
    const y = root?.scrollTop ?? window.scrollY;
    if (previousTime && now > previousTime)
      velocity = Math.max(0, (y - previousY) / (now - previousTime));
    previousTime = now;
    previousY = y;
  }
  $effect(() => {
    if (!container) return;
    const root = container.closest(".v2-main,.v2-dialog-content") ?? window;
    let frame = 0;
    const change = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    root.addEventListener("scroll", change, { passive: true });
    window.addEventListener("resize", change);
    const themeChanged = () => { rowSizes = {}; change(); };
    window.addEventListener("omd-theme-changed", themeChanged);
    const observer = new ResizeObserver(change);
    observer.observe(container);
    if (root instanceof Element) observer.observe(root);
    measure();
    return () => {
      root.removeEventListener("scroll", change);
      window.removeEventListener("resize", change);
      window.removeEventListener("omd-theme-changed", themeChanged);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  $effect(() => {
    void layout;
    void items.length;
    void hasMore;
    void fetching;
    void scroll;
    void viewport;
    void ahead;
    if (
      enabled &&
      !fetching &&
      hasMore &&
      (layout === "gallery"
        ? items.length - active < 8
        : totalHeight - scroll - viewport < ahead)
    )
      void more();
  });
  $effect(() => {
    if (layout === "gallery" && enabled) {
      untrack(() => {
        const root = container?.closest(".v2-main,.v2-dialog-content");
        if (root) root.scrollTop = 0;
        measure();
      });
    }
  });
  $effect(() => {
    if (active >= items.length) active = Math.max(0, items.length - 1);
  });
  $effect(() => {
    const element = gallery;
    void width;
    if (element)
      untrack(() => {
        element.scrollLeft = active * element.clientWidth;
      });
  });
  async function step(direction: number) {
    const next = active + direction;
    if (next < 0) return;
    if (next >= items.length && hasMore) await more();
    if (next < items.length)
      gallery?.scrollTo({
        left: next * gallery.clientWidth,
        behavior: "smooth",
      });
  }
  function galleryKey(event: KeyboardEvent) {
    if (layout !== "gallery" || !container?.contains(document.activeElement))
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      void step(event.key === "ArrowRight" ? 1 : -1);
    }
  }
  onDestroy(() => {
    alive = false;
  });
</script>

{#snippet navigation()}<GalleryNavigation
    index={active}
    total={items.length}
    {hasMore}
    onstep={step}
  />{/snippet}
<svelte:window onkeydown={galleryKey} />
<div
  class="result-browser"
  class:is-gallery={layout === "gallery"}
  style={`--gallery-height:${galleryHeight}px;--thumbnail-height:${tileWidth * (priority === "banner" ? 1 / 6 : mediaOnly ? 9 / 16 : priority === "equal" ? 1 : 1.5)}px`}
  bind:this={container}
>
  {#if pendingResults}
    <div
      class="result-placeholders"
      class:revealed={!!pendingLabel}
      role="status"
      aria-label="Loading results"
      style={`height:${galleryHeight}px;--columns:${columns};--row:${rowHeight}px`}
    >
      {#if layout === "gallery"}
        <div class="gallery-placeholder" inert aria-hidden="true">
          <ItemOverview
            {client}
            collection={{
              reference: { provider: "", id: "" },
              title: "",
              kind: mediaOnly ? "item" : "manga",
              canonical_url: "",
              artwork_url: null,
              description: null,
            }}
            media={mediaOnly}
            gallery
            placeholder
          />
        </div>
      {:else}
        <div
          class={`result-window ${layout}`}
          class:media-grid={mediaOnly}
          class:banner-grid={priority === "banner"}
          class:equal-grid={priority === "equal"}
          aria-hidden="true"
        >
          {#each Array(placeholderCount) as _}
            <div class="result-item placeholder-item">
              {#if layout !== "compact"}<div
                  class="artwork placeholder-block"
                ></div>{/if}
              <div class="result-copy">
                <div class="result-title">
                  <span class="placeholder-block placeholder-title"></span>
                </div>
                <div class="facts">
                  <span class="placeholder-block placeholder-facts"></span>
                </div>
                {#if layout !== "compact"}<div class="tags">
                    {#each Array(layout === "grid" && !mediaOnly ? 3 : 1) as _}<span
                        class="placeholder-block placeholder-tags"
                      ></span>{/each}
                  </div>{/if}
                {#if layout === "list"}<span
                    class="placeholder-block placeholder-description"
                  ></span>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if layout === "gallery"}
    {#if !oncontrols}{@render navigation()}{/if}
    <div
      class="gallery"
      bind:this={gallery}
      onscroll={() => {
        if (gallery)
          active = Math.round(gallery.scrollLeft / gallery.clientWidth);
      }}
    >
      <div class="gallery-track" style={`width:${items.length * width}px`}>
        {#each items.slice(Math.max(0, active - 2), active + 3) as item, index (`${item.reference.provider}:${item.reference.id}`)}
          {@const position = Math.max(0, active - 2) + index}
          <article
            class="gallery-item"
            inert={position !== active}
            aria-label={`${position + 1}: ${item.title}`}
            style={`left:${position * width}px;width:${width}px`}
          >
            <GalleryItem
              {client}
              collection={item}
              source={sources[item.reference.provider] ??
                item.reference.provider}
              account={accounts[item.reference.provider] ?? null}
              supportsDetails={!!manifests[
                item.reference.provider
              ]?.capabilities.includes("details")}
              {languages}
              media={!!manifests[item.reference.provider]?.media_tools}
              {oncollection}
              {ontagsearch}
              {selection}
            />
          </article>{/each}
      </div>
    </div>
  {:else}
    <div
      class="virtual-surface"
      style={`height:${totalHeight}px;--columns:${columns};--row:${rowHeight}px`}
    >
      {#each visibleRows as row (rowKeys[row])}
        <div
          class={`result-window result-row ${layout}`}
          class:media-grid={mediaOnly}
          class:banner-grid={priority === "banner"}
          class:equal-grid={priority === "equal"}
          style={`top:${offsets[row]}px`}
          use:measureRow={rowKeys[row]}
        >
          {#each items.slice(row * columns, Math.min(count, (row + 1) * columns)) as item (`${item.reference.provider}:${item.reference.id}`)}{@const summary =
              item.summary}
            <div class="result-entry" class:selectable={!!selection}>
            <button
              class="result-item"
              class:image-item={!!summary?.image}
              class:banner-item={summary?.artwork_layout === "banner"}
              class:audio-item={isAudioCollection(item)}
              class:media-item={!!manifests[item.reference.provider]
                ?.media_tools}
              aria-label={item.title}
              onclick={() => oncollection(item)}
            >
              {#if layout !== "compact" || isAudioCollection(item)}<Artwork
                  kind={artworkKind(item)}
                  {client}
                  provider={item.reference.provider}
                  url={item.artwork_url}
                  label={item.title}
                  fitted={!!summary?.image}
                />{/if}
              {#if layout === "grid" && summary?.content_rating && summary.content_rating !== "safe"}<span
                  class="cover-rating"
                  ><SourceBadge
                    label={summary.content_rating}
                    appearance={summary.content_rating_appearance}
                  /></span
                >{/if}
              {#if layout === "grid" && summary?.duration_seconds != null}<span
                  class="duration-badge"
                  >{durationLabel(summary.duration_seconds)}</span
                >{/if}
              <div class="result-copy">
                <div class="result-title">
                  <strong use:truncatedTitle={item.title}>{item.title}</strong
                  >{#if summary?.status && (layout === "list" || layout === "compact")}<SourceBadge
                      label={summary.status}
                      appearance={summary.status_appearance}
                      dot
                    />{/if}
                </div>
                {#if summary || Object.keys(sources).length > 1}<div
                    class="facts"
                  >
                    {#if Object.keys(sources).length > 1}<span
                        >{sources[item.reference.provider] ??
                          item.reference.provider}</span
                      >{/if}
                    {#if (layout === "list" || layout === "compact") && summary?.content_rating && summary.content_rating !== "safe"}<SourceBadge
                        label={summary.content_rating}
                        appearance={summary.content_rating_appearance}
                      />{/if}
                    {#if !isAudioCollection(item) && (manifests[item.reference.provider]?.media_tools || summary?.image) && summary?.creators?.length}<span
                        class="media-creator"
                        >{summary.creators.join(", ")}</span
                      >{/if}
                    {#if summary?.image}<span>{summary.image.count} {summary.image.count === 1 ? "image" : "images"}</span>{#if summary.image.width && summary.image.height}<span>{summary.image.width} × {summary.image.height}</span>{/if}{/if}
                    {#if summary?.view_count != null}<span
                        >{Intl.NumberFormat(appLocale(), {
                          notation: "compact",
                        }).format(summary.view_count)} views</span
                      >{/if}
                    {#if isAudioCollection(item)}{#each (summary?.tags??[]).filter(tag=>!/^(podcast|podcast episode|audio podcast)$/i.test(tag)) as tag}<span>{tag}</span>{/each}{/if}
                    {#if summary?.published_label}<span
                        >{publishedAge(summary.published_label)}</span
                      >{/if}
                    {#if layout !== "grid" && summary?.duration_seconds != null}<span
                        >{durationLabel(summary.duration_seconds)}</span
                      >{/if}
                    {#if summary?.rating != null}<span
                        title={`Rating: ${summary.rating.toFixed(1)}${summary.rating_max ? ` / ${summary.rating_max}` : ""}`}
                        ><Star size={12} />{summary?.rating.toFixed(1)}</span
                      >{/if}{#if summary?.followers != null}<span
                        ><Users size={12} />{Intl.NumberFormat(appLocale(), {
                          notation: "compact",
                        }).format(summary?.followers)}</span
                      >{/if}{#if summary?.year && !summary?.published_label}<span
                        >{summary?.year}</span
                      >{/if}{#if layout === "grid" && summary?.status}<SourceBadge
                        label={summary.status}
                        appearance={summary.status_appearance}
                        dot
                      />{/if}{#if (layout === "compact" || layout === "list") && summary?.original_language}<span
                        >{languageName(summary?.original_language)}</span
                      >{/if}
                  </div>{/if}
                {#if !isAudioCollection(item) && (layout === "grid" || layout === "compact") && summary?.tags?.length}<div
                    class="tags"
                  >
                    {#each (summary.image ? summary.tags.slice(0, 4) : summary.tags) as tag}<SourceBadge
                        label={tag}
                        appearance={summary.tag_appearances?.[tag]}
                      />{/each}{#if summary.image && summary.tags.length > 4}<span class="tag-count">+{summary.tags.length - 4}</span>{/if}
                  </div>{/if}
                {#if layout === "list"}{#if summary?.tags?.length}<div
                      class="tags"
                    >
                      {#each (summary.image ? summary.tags.slice(0, 4) : summary.tags) as tag}<SourceBadge
                          label={tag}
                          appearance={summary.tag_appearances?.[tag]}
                        />{/each}{#if summary.image && summary.tags.length > 4}<span class="tag-count">+{summary.tags.length - 4}</span>{/if}
                    </div>{/if}
                  <p>{item.description ?? ""}</p>{/if}
              </div></button>
              {#if selection}<div class="result-selection">{@render selection(item)}</div>{/if}
            </div>{/each}
        </div>
      {/each}
    </div>
  {/if}
  {#if !pendingResults && error}<div class="result-tail" role="alert">
      {error}<Button
        onclick={() => {
          error = "";
          void more();
        }}>Retry</Button
      >
    </div>{:else if !pendingResults && items.length}<div class="result-tail">
      <PendingStatus
        active={fetching || loading}
        label="Loading more titles…"
      />
    </div>{/if}
</div>

<style>
  .compact .result-item.audio-item {display:grid;grid-template-columns:48px minmax(0,1fr);gap:14px;align-items:center;min-height:76px;padding:12px 0;}
  .compact .result-item.audio-item :global(.artwork) {width:48px;height:48px;aspect-ratio:1;border-radius:8px;}
  .compact .result-item.audio-item .result-copy {display:flex;flex-direction:column;gap:6px;padding:0;}
  .compact .result-item.audio-item .result-title strong {-webkit-line-clamp:2;line-clamp:2;font-size:14px;}
  .grid .result-item.audio-item :global(.artwork) {aspect-ratio:1;}
  .result-item.image-item :global(.artwork img) { object-fit: contain; margin: auto; }
  .image-item .tags { max-height:none; overflow:visible; flex-wrap:wrap; }
  .image-item .tags :global(.source-badge) {white-space:normal;overflow:visible;overflow-wrap:anywhere;}
  .tag-count {font-size:11px;color:var(--muted);padding:2px 4px;}
  .result-entry { min-width:0; }
  .result-entry>.result-item { width:100%; }
  .result-entry.selectable>.result-item { padding-bottom:var(--theme-resultbrowser-padding-bottom-1, 10px); }
  .result-selection { padding-bottom:var(--theme-resultbrowser-padding-bottom-2, 22px); }
  /* Put list selection beside its row, never under the thumbnail as a separate item. */
  :is(.list,.compact) .result-entry.selectable {display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:12px;border-bottom:1px solid var(--line);}
  :is(.list,.compact) .result-entry.selectable>.result-item {grid-column:2;grid-row:1;border-bottom:0;}
  :is(.list,.compact) .result-entry.selectable>.result-selection {grid-column:2;grid-row:2;padding-bottom:12px;}
  /* With a checkbox, the selection is flattened so the checkbox takes the 28px leading
     column and any other control (such as "Downloaded") a cell of its own, rather than
     overflowing the checkbox column onto the artwork: a trailing column in compact rows,
     and a row under the item in list rows, whose artwork width follows the item column. */
  :is(.list,.compact) .result-entry.selectable:has(:global(input))>.result-selection,
  :is(.list,.compact) .result-entry.selectable:has(:global(input))>.result-selection>:global(div) {display:contents;}
  :is(.list,.compact) .result-entry.selectable:has(:global(input))>.result-selection :global(label) {grid-column:1;grid-row:1;font-size:0;gap:0;min-height:32px;display:flex;align-items:center;justify-content:center;}
  .compact .result-entry.selectable:has(:global(input)):has(>.result-selection :global(:is(button,a))) {grid-template-columns:28px minmax(0,1fr) auto;}
  .compact .result-entry.selectable:has(:global(input))>.result-selection :global(:is(button,a)) {grid-column:3;grid-row:1;justify-self:end;}
  .list .result-entry.selectable:has(:global(input))>.result-selection :global(:is(button,a)) {grid-column:2;grid-row:2;justify-self:end;margin-bottom:12px;}
  :is(.list,.compact) .result-entry.selectable:has(:global(input))>.result-selection :global(input) {margin:0;}
  .grid .result-item.banner-item :global(.artwork) { aspect-ratio:6/1; }

  .result-placeholders {
    position: relative;
    overflow: hidden;
    visibility: hidden;
  }
  .result-placeholders.revealed {
    visibility: visible;
  }
  .placeholder-block {
    display: block;
    background: var(--surface-soft);
    border-radius: var(--theme-resultbrowser-border-radius-3, 4px);
  }
  .placeholder-title {
    width: 85%;
    height: var(--theme-resultbrowser-height-4, 16px);
    margin-top: var(--theme-resultbrowser-margin-top-5, 2px);
  }
  .placeholder-facts {
    width: 55%;
    height: var(--theme-resultbrowser-height-6, 11px);
  }
  .placeholder-tags {
    width: 72%;
    height: var(--theme-resultbrowser-height-7, 18px);
  }
  .placeholder-description {
    width: 90%;
    height: var(--theme-resultbrowser-height-8, 12px);
  }
  .gallery-placeholder {
    height: calc(100% - var(--theme-resultbrowser-height-9, 44px));
  }

  .cover-rating :global(.source-badge) {
    background: var(--surface);
    box-shadow:
      0 var(--theme-resultbrowser-box-shadow-10, 1px) var(--theme-resultbrowser-box-shadow-11, 5px) var(--theme-resultbrowser-box-shadow-12, #0008),
      inset 0 0 0 var(--theme-resultbrowser-box-shadow-10, 1px) var(--line-strong);
  }
  .cover-rating {
    position: absolute;
    top: var(--theme-resultbrowser-top-13, 8px);
    left: var(--theme-resultbrowser-left-14, 8px);
    text-transform: capitalize;
  }

  .result-browser {
    min-width: 0;
    overflow-anchor: none;
  }
  .virtual-surface {
    position: relative;
    overflow-anchor: none;
  }
  .result-window {
    position: absolute;
    left: 0;
    right: 0;
    display: grid;
    
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    grid-auto-rows: auto;
    column-gap: var(--theme-resultbrowser-column-gap-15, 18px);
  }
  .result-placeholders .result-window {
    grid-auto-rows: var(--row);
  }
  .result-row {
    min-height: var(--row);
    align-items: start;
  }
  .result-window .result-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    text-align: left;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 0 0 var(--theme-resultbrowser-padding-16, 22px);
    border-radius: var(--theme-resultbrowser-border-radius-17, 8px);
  }
  .result-item :global(.artwork) {
    position: relative;
    width: 100%;
    height: auto;
    aspect-ratio: 2/3;
    border-radius: var(--theme-resultbrowser-border-radius-17, 8px);
    background: var(--surface-soft);
    flex-shrink: 0;
  }
  .result-item :global(.artwork img) {
    position: absolute;
    inset: 0;
    width:100%;
    height:100%;
    object-fit: cover;
  }
  .grid.banner-grid .result-item :global(.artwork) { aspect-ratio:6/1; }
  .grid.media-grid:not(.banner-grid) .result-item:not(.banner-item) :global(.artwork) {
    aspect-ratio: 16/9;
  }
  .result-item.media-item :global(.artwork img) {
    object-fit: contain;
  }
  .grid.equal-grid .result-item :global(.artwork) {
    aspect-ratio: 1;
  }
  .grid.equal-grid .result-item :global(.artwork img) {
    object-fit: contain;
  }
  .list .result-item.media-item {
    
    grid-template-columns: minmax(140px, 25%) minmax(0, 1fr);
  }
  .list .result-item.media-item :global(.artwork) {
    height: auto;
    aspect-ratio: 16/9;
  }
  .duration-badge {
    position: absolute;
    right: var(--theme-resultbrowser-right-18, 8px);
    top: calc(var(--thumbnail-height) - var(--theme-resultbrowser-top-19, 30px));
    padding: var(--theme-resultbrowser-padding-20, 3px) var(--theme-resultbrowser-padding-21, 6px);
    border-radius: var(--theme-resultbrowser-border-radius-3, 4px);
    background: var(--theme-resultbrowser-background-22, #000d);
    color: white;
    font-size: var(--theme-resultbrowser-font-size-23, 12px);
    font-variant-numeric: tabular-nums;
  }
  .result-copy {
    padding: var(--theme-resultbrowser-padding-24, 9px) var(--theme-resultbrowser-padding-25, 1px) 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--theme-resultbrowser-gap-26, 5px);
  }
  .result-title {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--theme-resultbrowser-gap-27, 12px);
  }
  .result-title > :global(.source-badge) {
    flex-shrink: 0;
  }
  .result-title strong {
    min-width: 0;
    flex: 1;
    font-size: var(--theme-resultbrowser-font-size-28, 14px);
    line-height: var(--theme-resultbrowser-line-height-29, 1.4);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .grid .result-title {
    min-height: var(--theme-resultbrowser-min-height-30, 39.2px);
  }
  .grid.media-grid .result-title {
    min-height: 0;
  }
  .grid .media-creator {
    flex-basis: 100%;
  }
  .grid .facts {
    min-height: var(--theme-resultbrowser-min-height-31, 18px);
  }
  .result-item:hover strong {
    color: var(--accent-text);
  }
  .result-copy p {
    font-size: var(--theme-resultbrowser-font-size-32, 13px);
    line-height: var(--theme-resultbrowser-line-height-33, 1.5);
    color: var(--muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
  }
  .facts {
    display: flex;
    align-items: center;
    gap: var(--theme-resultbrowser-gap-34, 10px);
    color: var(--muted);
    font-size: var(--theme-resultbrowser-font-size-35, 11px);
    line-height: var(--theme-resultbrowser-line-height-36, 18px);
    flex-wrap: wrap;
    white-space: normal;
  }
  .facts span {
    display: inline-flex;
    align-items: center;
    gap: var(--theme-resultbrowser-gap-37, 4px);
  }
  .tags {
    display: flex;
    gap: var(--theme-resultbrowser-gap-26, 5px);
    flex-wrap: wrap;
    min-height: var(--theme-resultbrowser-min-height-38, 20px);
    flex-shrink: 0;
  }
  .tags :global(.source-badge) {
    flex-shrink: 0;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
    overflow: visible;
  }
  .list .result-item {
    display: grid;
    
    grid-template-columns: 78px minmax(0, 1fr);
    gap: var(--theme-resultbrowser-gap-39, 16px);
    padding: var(--theme-resultbrowser-padding-40, 14px) 0;
    border-bottom: var(--theme-resultbrowser-border-bottom-41, 1px) solid var(--line);
    border-radius: 0;
  }
  .list .result-item :global(.artwork) {
    height: var(--theme-resultbrowser-height-42, 118px);
    aspect-ratio: auto;
  }
  .list .result-copy {
    padding: 0;
    gap: var(--theme-resultbrowser-gap-26, 5px);
  }
  .list .result-title strong {
    font-size: var(--theme-resultbrowser-font-size-43, 15px);
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  .compact .result-item {
    padding: var(--theme-resultbrowser-padding-24, 9px) 0;
    border-bottom: var(--theme-resultbrowser-border-bottom-41, 1px) solid var(--line);
    border-radius: 0;
  }
  .compact .result-copy {
    padding: 0;
    gap: var(--theme-resultbrowser-gap-37, 4px) var(--theme-resultbrowser-gap-39, 16px);
    display: grid;
    
    grid-template-columns: auto minmax(0, 1fr);
    width: 100%;
  }
  .compact .result-title {
    grid-column: 1/-1;
  }
  .compact .facts {
    grid-column: 1;
  }
  .compact .tags {
    grid-column: 2;
    align-self: center;
  }
  .compact strong {
    -webkit-line-clamp: 1;
    line-clamp: 1;
    font-size: var(--theme-resultbrowser-font-size-32, 13px);
  }
  .result-tail {
    height: var(--theme-resultbrowser-height-44, 60px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--theme-resultbrowser-gap-27, 12px);
    color: var(--muted);
    font-size: var(--theme-resultbrowser-font-size-23, 12px);
  }
  .gallery-controls {
    display: flex;
    align-items: center;
    justify-content: end;
    gap: var(--theme-resultbrowser-gap-45, 8px);
    margin-bottom: var(--theme-resultbrowser-margin-bottom-46, 12px);
  }
  .gallery-controls span {
    margin-right: auto;
    font-size: var(--theme-resultbrowser-font-size-23, 12px);
    color: var(--muted);
  }
  .result-browser.is-gallery {
    height: var(--gallery-height);
  }
  .gallery {
    height: calc(100% - var(--theme-resultbrowser-height-9, 44px));
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }
  .gallery-track {
    position: relative;
    height: 100%;
  }
  .gallery-item {
    overflow-y: auto;
    scrollbar-gutter: stable;
    position: absolute;
    top: 0;
    height: 100%;
    scroll-snap-align: start;
  }
</style>
