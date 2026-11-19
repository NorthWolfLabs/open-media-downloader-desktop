<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import ImageOverview from "./ImageOverview.svelte";
  import ChannelOverview from "./ChannelOverview.svelte";
  import Artwork from "./Artwork.svelte";
  import SourceBadge from "./SourceBadge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import { cachedArtwork } from "./artworkCache";
  import { summaryDetails } from "./summaryDetails";
  import { isAudioCollection } from "./mediaPresentation";
  import { publishedAge } from "./mediaPresentation";
  import { languageName, preferredLanguages } from "./languages";
  import type { Collection, CollectionDetails, EngineClient } from "./client";
  let {
    client,
    media = false,
    collection,
    oncollection,
    ontagsearch,
    info: full = null,
    detailsLoading = false,
    heading,
    actions,
    languages = "",
    gallery = false,
    placeholder = false,
  }: {
    client: EngineClient;
    media?: boolean;
    collection: Collection;
    oncollection?: (collection: Collection) => void;
    ontagsearch?: (provider:string,tag:string)=>void;
    info?: CollectionDetails | null;
    detailsLoading?: boolean;
    heading?: Snippet;
    actions?: Snippet;
    languages?: string;
    gallery?: boolean;
    placeholder?: boolean;
  } = $props();
  let coverRatio = $state(
    untrack(
      () =>
        cachedArtwork(
          client,
          collection.reference.provider,
          collection.artwork_url,
        )?.ratio ?? (media ? 16 / 9 : 2 / 3),
    ),
  );
  const parent = $derived(collection.summary?.parent);
  const info = $derived(full ?? summaryDetails(collection));
  const preferredLocales = $derived([
    ...new Set([
      ...languages.split(",").filter(Boolean),
      ...preferredLanguages(),
    ]),
  ]);
  const alternateTitles = $derived(
    Object.entries(info?.alternative_titles ?? {}).sort(([a], [b]) => {
      const rank = (id: string) =>
        preferredLocales.includes(id)
          ? preferredLocales.indexOf(id)
          : preferredLocales.length;
      return (
        rank(a) - rank(b) || languageName(a).localeCompare(languageName(b))
      );
    }),
  );
</script>

{#if collection.summary?.image}
  <ImageOverview {detailsLoading} {client} {collection} {info} {heading} {actions} {gallery} {oncollection} ontagsearch={full ? ontagsearch : undefined}/>
{:else if isAudioCollection(collection) && !gallery}
<section class="podcast-overview" class:episode={collection.kind==="item"}>
  <div class="podcast-cover"><Artwork {client} provider={collection.reference.provider} url={collection.artwork_url} label={collection.title} kind="audio"/></div>
  <div class="podcast-copy"><div class="podcast-type">{collection.kind==="item"?"Podcast episode":"Podcast"}{#if collection.summary?.video_count_label}{" · "}{collection.summary.video_count_label}{/if}</div>
    {@render heading?.()}
    {#if collection.summary?.creators?.length}<p class="podcast-author">{collection.summary.creators.join(' · ')}</p>{/if}
    {#if collection.description}<p class="podcast-description">{collection.description}</p>{/if}
    <div class="podcast-actions">{@render actions?.()}</div>
  </div>
</section>
{:else if collection.summary?.artwork_layout === "banner"}
  <ChannelOverview {client} {collection} {heading} {actions} />
{:else}
<div class="overview-frame" class:fill={gallery}>
  <div
    class="item-overview"
    class:placeholder
    class:landscape={media || coverRatio > 1 || !!collection.summary?.image}
    class:image-post={!!collection.summary?.image}
    class:no-facts={!placeholder &&
      !detailsLoading &&
      !info?.facts.length &&
      !alternateTitles.length}
    class:gallery
    style={`--cover-ratio:${gallery ? coverRatio : Math.max(0.5, Math.min(1, coverRatio))}`}
  >
    <Artwork
      fitted
      ondimensions={(ratio) => {
        coverRatio = ratio;
      }}
      {client}
      provider={collection.reference.provider}
      url={collection.artwork_url}
      label={collection.title}
    />
    <div class="overview-copy">
      <div class="overview-heading">
        {#if placeholder}<span class="skeleton heading-skeleton"
          ></span>{:else if heading}{@render heading()}{/if}
      </div>
      {#if placeholder}<div class="overview-actions">
          <span class="skeleton action-skeleton"></span>
        </div>{/if}
      {#if actions}<div class="overview-actions">{@render actions()}</div>{/if}
      <div class="creators" class:ui-enter={!!full} aria-busy={detailsLoading}>
        {#if parent && oncollection}
          <span class="parent-collection">
            <button class="parent-link" aria-label={`View ${parent.kind === "channel" ? "channel" : "collection"} ${parent.title}`} onclick={() => oncollection?.({...parent, artwork_url:null, description:null})}>{parent.title}</button>
          </span>
        {:else if info?.creators.length}
          {#each info.creators as creator}<span
              ><span class="creator-role">{creator.label}</span>
              {creator.values.join(" · ")}</span
            >{/each}
        {:else if detailsLoading || placeholder}<span
            class="metadata-placeholder"
            aria-hidden="true"
          ></span>{/if}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Safari keyboard scrolling) -->
      <div class="synopsis" role="region" aria-label="Description" tabindex="0">
        {#if placeholder}<div class="synopsis-skeleton">
            {#each Array(6) as _}<span class="skeleton"></span>{/each}
          </div>{:else}<p>
            {info?.description ||
              collection.description ||
              (detailsLoading || collection.summary?.image ? "" : "No description available.")}
          </p>{/if}
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Safari keyboard scrolling) -->
      <div
        class="metadata-tags"
        class:ui-enter={!!full}
        role="region"
        aria-label="Tags"
        tabindex="0"
      >
        {#each info?.tags ?? [] as tag}<SourceBadge
            label={tag.label}
            appearance={tag.appearance}
          />{/each}
      </div>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Safari keyboard scrolling) -->
    {#if placeholder || detailsLoading || info?.facts.length || alternateTitles.length}
      <aside
        class="story-facts"
        class:ui-enter={!!full}
        aria-label="Publication details"
        tabindex="0"
      >
        {#if info}
          <dl>
            {#each info.facts as field}<div>
                <dt>{field.label}</dt>
                <dd>
                  {#if field.appearance}<SourceBadge
                      label={field.values.join(" · ")}
                      appearance={field.appearance}
                    />{:else}{(gallery && media && field.label === "Published" ? field.values.map(value => publishedAge(value)) : field.values).join(" · ")}{/if}
                </dd>
              </div>{/each}
          </dl>
          {#if alternateTitles.length}<h3>Alternative titles</h3>
            <dl>
              {#each alternateTitles as [locale, titles]}<div>
                  <dt>{languageName(locale)}</dt>
                  <dd>{titles.join(" · ")}</dd>
                </div>{/each}
            </dl>
          {/if}
          {#if !info.facts.length && !alternateTitles.length}<EmptyState
              compact
              level={3}
              title="No additional details"
            />{/if}
        {:else if detailsLoading || placeholder}<div
            class="facts-skeleton"
            role="status"
            aria-label="Loading details"
          >
            <span class="sr-only">Loading details…</span
            >{#each [1, 2, 3, 4]}<div aria-hidden="true">
                <span></span><span></span>
              </div>{/each}
          </div>
        {:else}<EmptyState
            compact
            level={3}
            title="No additional details"
          />{/if}
      </aside>
    {/if}
  </div>
</div>

{/if}
<style>
.podcast-overview{display:flex;gap:24px;align-items:flex-start;padding:8px 0 24px;margin-bottom:12px;border-bottom:1px solid var(--line)}.podcast-cover{width:112px;height:112px;flex-shrink:0;background:var(--surface-soft);border-radius:14px;overflow:hidden}.podcast-cover :global(.artwork){width:100%;height:100%}.podcast-cover :global(img){object-fit:cover}.podcast-copy{min-width:0;flex:1}.podcast-copy :global(h1){font-size:24px;line-height:1.25;margin:4px 0 8px}.podcast-copy :global(.v2-source-name){display:none}.podcast-type,.podcast-author{font-size:12px;color:var(--muted)}.podcast-description{line-height:1.5;color:var(--muted);font-size:13px;max-width:720px;margin:10px 0;display:-webkit-box;line-clamp:2;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.podcast-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}@media(max-width:800px){.podcast-cover{width:72px;height:72px}.podcast-overview{gap:16px}.podcast-copy :global(h1){font-size:20px}}

  .placeholder :global(.artwork) {
    background: var(--surface-soft);
  }
  .skeleton {
    display: block;
    height: var(--theme-itemoverview-height-1, 12px);
    width: 85%;
    background: var(--surface-soft);
    border-radius: var(--theme-itemoverview-border-radius-2, 4px);
  }
  .heading-skeleton {
    height: var(--theme-itemoverview-height-3, 28px);
    margin: var(--theme-itemoverview-margin-4, 12px) 0;
  }
  .action-skeleton {
    width: var(--theme-itemoverview-width-5, 110px);
    height: var(--theme-itemoverview-height-6, 36px);
  }
  .synopsis-skeleton {
    display: grid;
    gap: var(--theme-itemoverview-gap-7, 12px);
    padding-top: var(--theme-itemoverview-padding-top-8, 8px);
  }
  .synopsis-skeleton .skeleton:last-child {
    width: 55%;
  }

  .item-overview {
    display: grid;
    
    --overview-height: 300px;
    
    grid-template-columns:
      min(
        calc(var(--overview-height) * var(--cover-ratio)),
        calc((100% - 238px) / 2)
      )
      minmax(0, 1fr) 190px;
    gap: var(--theme-itemoverview-gap-9, 24px);
    height: var(--overview-height);
    margin: 0 0 var(--theme-itemoverview-margin-10, 16px);
  }
  .item-overview > :global(.artwork) {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .item-overview > :global(.artwork img) {
    object-fit: contain;
  }
  .overview-copy {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--theme-itemoverview-gap-11, 8px);
  }
  .overview-heading {
    max-height: var(--theme-itemoverview-max-height-12, 120px);
    min-height: var(--theme-itemoverview-min-height-13, 50px);
    flex-shrink: 0;
    overflow: auto;
  }
  .creators {
    min-height: var(--theme-itemoverview-min-height-14, 20px);
    display: flex;
    flex-wrap: wrap;
    gap: var(--theme-itemoverview-gap-15, 5px) var(--theme-itemoverview-gap-16, 14px);
    font-size: var(--theme-itemoverview-font-size-17, 12px);
    max-height: var(--theme-itemoverview-max-height-18, 40px);
    overflow: auto;
    flex-shrink: 0;
  }
  .parent-collection { display:inline-flex; align-items:center; gap:var(--theme-itemoverview-gap-19, 4px); min-width:0; }
  .parent-link { display:inline-flex; align-items:center; gap:var(--theme-itemoverview-gap-20, 6px); min-width:0; min-height:var(--theme-itemoverview-min-height-21, 28px); padding:0 var(--theme-itemoverview-padding-22, 2px); border:0; background:transparent; color:var(--text); font:inherit; text-align:left; text-decoration:underline; text-underline-offset:var(--theme-itemoverview-text-underline-offset-23, 3px); cursor:pointer; }
  .parent-link:hover { color:var(--accent-text); }
  .creators:has(.parent-collection) { max-height:none; }
  .creator-role {
    color: var(--muted);
    margin-right: var(--theme-itemoverview-margin-right-24, 5px);
  }
  .synopsis {
    min-height: var(--theme-itemoverview-min-height-25, 40px);
    flex: 1;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    padding-right: var(--theme-itemoverview-padding-right-26, 8px);
  }
  .synopsis p {
    white-space: pre-line;
    line-height: var(--theme-itemoverview-line-height-27, 1.65);
    font-size: var(--theme-itemoverview-font-size-28, 14px);
    margin: 0;
  }
  .metadata-tags {
    display: flex;
    gap: var(--theme-itemoverview-gap-20, 6px);
    flex-wrap: wrap;
    overflow: auto;
    max-height: 80px;
    min-height: var(--theme-itemoverview-min-height-29, 26px);
    flex-shrink: 0;
    scrollbar-width: thin;
    padding-bottom: var(--theme-itemoverview-padding-bottom-30, 5px);
  }
  .metadata-tags :global(.source-badge) {
    flex-shrink: 0;
  }
  .story-facts {
    min-width: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    border-left: var(--theme-itemoverview-border-left-31, 1px) solid var(--line);
    padding: 0 var(--theme-itemoverview-padding-32, 8px) 0 var(--theme-itemoverview-padding-33, 18px);
    font-size: var(--theme-itemoverview-font-size-17, 12px);
  }
  .facts-skeleton {
    display: grid;
    gap: var(--theme-itemoverview-gap-34, 18px);
  }
  .facts-skeleton > div {
    display: grid;
    gap: var(--theme-itemoverview-gap-11, 8px);
  }
  .facts-skeleton > div > span,
  .metadata-placeholder {
    display: block;
    height: var(--theme-itemoverview-height-35, 10px);
    width: 70%;
    border-radius: var(--theme-itemoverview-border-radius-2, 4px);
    background: var(--surface-soft);
  }
  .facts-skeleton > div > span:last-child {
    width: 45%;
  }
  .metadata-placeholder {
    width: var(--theme-itemoverview-width-36, 160px);
    height: var(--theme-itemoverview-height-1, 12px);
    align-self: center;
  }
  .story-facts dl {
    margin: 0;
    display: grid;
    gap: var(--theme-itemoverview-gap-16, 14px);
  }
  .story-facts dt {
    color: var(--muted);
    margin-bottom: var(--theme-itemoverview-margin-bottom-37, 4px);
  }
  .story-facts > dl:first-child dd {
    text-transform: capitalize;
  }
  .story-facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .story-facts h3 {
    font-size: var(--theme-itemoverview-font-size-38, 13px);
    margin: var(--theme-itemoverview-margin-39, 22px) 0 var(--theme-itemoverview-margin-40, 14px);
  }

  @media (max-width: 1000px) {
    .item-overview {
      
      --overview-height: 270px;
      
      grid-template-columns:
        calc(var(--overview-height) * var(--cover-ratio))
        minmax(0, 1fr);
      height: var(--theme-itemoverview-height-41, 430px);
      
      grid-template-rows: 270px 144px;
      gap: var(--theme-itemoverview-gap-42, 16px);
    }
    .item-overview > :global(.artwork) {
      width: 100%;
      height: 100%;
    }
    .story-facts {
      grid-column: 1/-1;
      border-left: 0;
      border-top: var(--theme-itemoverview-border-top-43, 1px) solid var(--line);
      padding: var(--theme-itemoverview-padding-44, 12px) 0 0;
    }
    .facts-skeleton {
      display: grid;
      gap: var(--theme-itemoverview-gap-34, 18px);
    }
    .facts-skeleton > div {
      display: grid;
      gap: var(--theme-itemoverview-gap-11, 8px);
    }
    .facts-skeleton > div > span,
    .metadata-placeholder {
      display: block;
      height: var(--theme-itemoverview-height-35, 10px);
      width: 70%;
      border-radius: var(--theme-itemoverview-border-radius-2, 4px);
      background: var(--surface-soft);
    }
    .facts-skeleton > div > span:last-child {
      width: 45%;
    }
    .metadata-placeholder {
      width: var(--theme-itemoverview-width-36, 160px);
      height: var(--theme-itemoverview-height-1, 12px);
      align-self: center;
    }
    .story-facts dl {
      
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--theme-itemoverview-gap-7, 12px) var(--theme-itemoverview-gap-45, 20px);
    }
  }

  .overview-frame {
    container-type: inline-size;
  }
  .overview-frame.fill {
    height: 100%;
  }
  .item-overview.gallery {
    height: 100%;
    margin: 0;
    
    grid-template-columns:
      min(
        calc((var(--gallery-height) - 44px) * min(1, var(--cover-ratio))),
        39%
      )
      minmax(0, 1fr) minmax(150px, 18%);
    
    grid-template-rows: minmax(0, 1fr);
  }
  .gallery > :global(.artwork) {
    background: transparent;
  }
  .gallery > :global(.artwork img) {
    object-position: center;
  }
  .gallery .overview-heading {
    max-height: 30%;
  }
  .gallery .metadata-tags {
    flex-wrap: wrap;
    overflow: auto;
    max-height: 25%;
  }
  .gallery .synopsis {
    padding-right: 0;
  }
  @container (max-width: 850px) {
    .item-overview.gallery {
      
      grid-template-columns: minmax(120px, 34%) minmax(0, 1fr);
      
      grid-template-rows: minmax(0, 1fr) minmax(100px, 28%);
      gap: var(--theme-itemoverview-gap-42, 16px);
    }
    .gallery .story-facts {
      grid-column: 1/-1;
      border-left: 0;
      border-top: var(--theme-itemoverview-border-top-43, 1px) solid var(--line);
      padding: var(--theme-itemoverview-padding-44, 12px) 0 0;
    }
    .gallery .story-facts dl {
      
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }
  }
  .item-overview.no-facts:not(.landscape) {
    
    grid-template-columns: minmax(120px, 36%) minmax(0, 1fr);
  }
  .item-overview.landscape,
  .item-overview.gallery.landscape {
    
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    
    grid-template-rows: auto 1fr;
    height: auto;
    gap: var(--theme-itemoverview-gap-45, 20px) var(--theme-itemoverview-gap-9, 24px);
    align-items: start;
  }
  .landscape > :global(.artwork) {
    grid-column: 1;
    grid-row: 1 / 3;
    height: auto;
    aspect-ratio: 16/9;
    border-radius: var(--theme-itemoverview-border-radius-46, 8px);
    container-type: normal;
  }
  .landscape > :global(.artwork img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: top center;
  }
  .landscape .overview-copy {
    grid-column: 2;
    grid-row: 1;
  }
  .landscape .overview-heading {
    min-height: 0;
    max-height: none;
    overflow: visible;
  }
  .landscape .synopsis {
    flex: initial;
    max-height: var(--theme-itemoverview-max-height-47, 220px);
    overflow-wrap: anywhere;
  }
  .landscape .metadata-tags:empty {
    display: none;
  }
  .landscape .story-facts {
    grid-column: 2;
    grid-row: 2;
    border-left: 0;
    border-top: var(--theme-itemoverview-border-top-43, 1px) solid var(--line);
    padding: var(--theme-itemoverview-padding-48, 16px) 0 0;
    overflow: visible;
  }
  .landscape .story-facts > dl:first-child dd { text-transform:none; }
  .landscape .story-facts dl {
    
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: var(--theme-itemoverview-gap-42, 16px);
  }
  .gallery.landscape .synopsis {
    max-height: min(var(--theme-itemoverview-max-height-49, 280px), calc(var(--gallery-height) - var(--theme-itemoverview-max-height-50, 320px)));
  }
  .item-overview.image-post > :global(.artwork) {
    height: min(60vh, 640px);
    aspect-ratio: auto;
    container-type: size;
  }
  .item-overview.image-post > :global(.artwork img) {
    width: 100%; height: 100%; object-fit: contain; object-position: center;
  }
  @container (max-width: 650px) {
    .item-overview.landscape,
    .item-overview.gallery.landscape {
      
      grid-template-columns: 1fr;
      
      grid-template-rows: auto auto auto;
    }
    .landscape > :global(.artwork) {
      grid-column: 1;
      grid-row: 1;
    }
    .landscape .overview-copy {
      grid-column: 1;
      grid-row: 2;
    }
    .landscape .story-facts {
      grid-column: 1;
      grid-row: 3;
    }
    .gallery.landscape .synopsis {
      max-height: var(--theme-itemoverview-max-height-51, 180px);
    }
  }


.episode .podcast-description{display:block;line-clamp:unset;-webkit-line-clamp:unset}.podcast-overview{margin-bottom:0;padding-bottom:16px}@media(max-width:800px){.podcast-overview:not(.episode) .podcast-description{line-clamp:1;-webkit-line-clamp:1}.podcast-author{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.podcast-actions{margin-top:8px}}
</style>
