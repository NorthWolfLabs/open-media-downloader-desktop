<script module lang="ts">
  import type {
    Artwork as SavedArtwork,
    Collection as SavedCollection,
  } from "./client";
  import type { ResultLayout as SavedLayout } from "./LayoutPicker.svelte";
  export type CollectionInfoSnapshot = {
    profile?: import("./ImageProfile.svelte").ImageProfileState;
    identity: string;
    account: string | null;
    sourceVersion?: string;
    tab: string;
    art: SavedArtwork[];
    related: SavedCollection[];
    recommendations: SavedCollection[];
    artCursor: string | null;
    relatedCursor: string | null;
    recommendationCursor: string | null;
    sections: Record<
      "artwork" | "related" | "recommendations",
      { loading: boolean; loaded: boolean; error: string }
    >;
    resultLayout: SavedLayout;
    active: number;
    artLocale: string[];
    localeChosen: boolean;
  };
</script>

<script lang="ts">
  import { isAudioCollection } from "./mediaPresentation";
  import ImageProfile from "./ImageProfile.svelte";
  import type {Destination} from "./client";
  import ChannelCollections from "./ChannelCollections.svelte";
  import PendingStatus from "./ui/PendingStatus.svelte";
  import { sectionPage } from "./sectionCache";
  import EmptyState from "./ui/EmptyState.svelte";
  import { itemMetadata, cachedItemMetadata } from "./itemCache";
  import ItemOverview from "./ItemOverview.svelte";
  import Button from "./ui/Button.svelte";
  import { BookOpen, Image } from "lucide-svelte";
  import ResultBrowser from "./ResultBrowser.svelte";
  import LayoutPicker, { type ResultLayout } from "./LayoutPicker.svelte";
  import ChoicePicker from "./ChoicePicker.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import type { Snippet } from "svelte";
  import { onDestroy, untrack } from "svelte";
  import type {
    EngineClient,
    Collection,
    CollectionDetails,
    Artwork as Art,
    Page,
    ProviderManifest,
  } from "./client";
  import Artwork from "./Artwork.svelte";
  import { languageName, preferredLanguages } from "./languages";
  let {
    client,
    collection,
    manifest,
    oncollection,
    ontagsearch,
    onimagedownload,
    destinations=[],
    onsection,
    onlanguages,
    children,
    heading,
    actions,
    account = null,
    languages = "",
    initialState,
  }: {
    client: EngineClient;
    collection: Collection;
    manifest?: ProviderManifest;
    oncollection: (c: Collection) => void;
    ontagsearch?: (provider:string,tag:string)=>void;
    onimagedownload?: (items:Collection[],destination:string)=>Promise<void>;
    destinations?:Destination[];
    onsection?: (c: Collection) => void;
    account?: string | null;
    languages?: string;
    initialState?: CollectionInfoSnapshot;
    onlanguages: (values: string[]) => void;
    children: Snippet;
    heading?: Snippet;
    actions?: Snippet;
  } = $props();
  let profileView = $state<{snapshot:()=>import("./ImageProfile.svelte").ImageProfileState}>();
  let info: CollectionDetails | null = $state(null),
    art: Art[] = $state([]),
    recommendations: Collection[] = $state([]),
    related: Collection[] = $state([]),
    relatedCursor: string | null = $state(null),
    artCursor: string | null = $state(null),
    recommendationCursor: string | null = $state(null),
    tab = $state("Releases"),
    version = 0;
  type Section = "artwork" | "related" | "recommendations";
  const emptySections = () => ({
    artwork: { loading: false, loaded: false, error: "" },
    related: { loading: false, loaded: false, error: "" },
    recommendations: { loading: false, loaded: false, error: "" },
  });
  let sections = $state(emptySections());
  const activeSection = $derived<Section>(
    tab === "Artwork"
      ? "artwork"
      : tab === "Related titles"
        ? "related"
        : "recommendations",
  );
  const loading = $derived(
    tab !== "Releases" && sections[activeSection].loading,
  );
  const error = $derived(
    tab !== "Releases" ? sections[activeSection].error : "",
  );
  let detailsLoading = $state(false),
    metadataError = $state("");
  let galleryControls = $state<Snippet>();
  let resultLayout = $state<ResultLayout>("grid");
  let active = $state(0);
  let localeChosen = false;
  let artLocale = $state<string[]>([]);
  const artLocales = $derived(
    [...new Set(art.map((a) => a.locale).filter((v): v is string => !!v))]
      .sort()
      .map((id) => ({ id, label: languageName(id) })),
  );
  const visibleArt = $derived(
    art.filter((a) => !artLocale.length || artLocale.includes(a.locale ?? "")),
  );
  const channelSections = $derived(collection.summary?.sections ?? []);
  const currentChannelSection = $derived(channelSections.find(section => section.reference.id === collection.reference.id));
  const supports = (name: string) => manifest?.capabilities.includes(name);
  async function about() {
    const current = ++version;
    info =
      cachedItemMetadata<CollectionDetails>(
        client,
        collection,
        "details",
        account,
      ) ?? null;
    metadataError = "";
    if (info) {
      detailsLoading = false;
      onlanguages(info.languages);
      return;
    }
    if (!supports("details")) {
      if (collection.kind !== "manga") {
        onlanguages([]);
        return;
      }
      detailsLoading = true;
      try {
        const values = new Set<string>();
        let cursor: string | null = null;
        const seen = new Set<string>();
        do {
          const page: Page<import("./client").Release> = await client.operation<
            Page<import("./client").Release>
          >(collection.reference.provider, {
            operation: "releases",
            reference: collection.reference,
            cursor,
            page_size: 100,
            policy: {
              languages: [],
              groups: [],
              subtitle_languages: [],
              automatic_subtitles: false,
              max_height: 1080,
            },
            credential_profile: account,
          });
          if (current !== version) return;
          for (const release of page.items)
            if (release.language) values.add(release.language);
          cursor = page.next_cursor;
          if (cursor && seen.has(cursor))
            throw new Error(
              "The source repeated a release page. Update the source and retry.",
            );
          if (cursor) seen.add(cursor);
        } while (cursor);
        onlanguages([...values]);
      } catch (e) {
        if (current === version)
          metadataError = e instanceof Error ? e.message : String(e);
      } finally {
        if (current === version) detailsLoading = false;
      }
      return;
    }
    detailsLoading = true;
    try {
      const result = await itemMetadata<CollectionDetails>(
        client,
        collection,
        "details",
        account,
      );
      if (current === version) {
        info = result;
        onlanguages(result.languages);
      }
    } catch (e) {
      if (current === version)
        metadataError = e instanceof Error ? e.message : String(e);
    } finally {
      if (current === version) detailsLoading = false;
    }
  }
  const identity = $derived(JSON.stringify(collection.reference));
  $effect(() => {
    void identity;
    void account;
    void client;
    void manifest;
    untrack(() => {
      const saved =
        initialState?.identity === identity &&
        initialState.account === account &&
        initialState.sourceVersion === manifest?.version
          ? initialState
          : undefined;
      tab = saved?.tab ?? "Releases";
      artLocale = saved?.artLocale ?? [];
      localeChosen = saved?.localeChosen ?? false;
      resultLayout = saved?.resultLayout ?? "grid";
      active = saved?.active ?? 0;
      sections = saved
        ? (Object.fromEntries(
            Object.entries(saved.sections).map(([key, value]) => [
              key,
              { ...value, loading: false },
            ]),
          ) as typeof sections)
        : emptySections();
      art = saved?.art ?? [];
      recommendations = saved?.recommendations ?? [];
      related = saved?.related ?? [];
      relatedCursor = saved?.relatedCursor ?? null;
      artCursor = saved?.artCursor ?? null;
      recommendationCursor = saved?.recommendationCursor ?? null;
      void about();
      if (tab !== "Releases") {
        const section =
          tab === "Artwork"
            ? "artwork"
            : tab === "Related titles"
              ? "related"
              : "recommendations";
        if (!sections[section].loaded && !sections[section].error)
          void load(section);
      }
    });
  });
  async function load(
    kind: "artwork" | "recommendations" | "related",
    more = false,
  ) {
    const current = version;
    if (sections[kind].loading) return;
    sections[kind].loading = true;
    sections[kind].error = "";
    try {
      let result = await sectionPage<Art | Collection>(
        client,
        collection.reference.provider,
        {
          operation: kind,
          reference: collection.reference,
          cursor: more
            ? kind === "artwork"
              ? artCursor
              : kind === "related"
                ? relatedCursor
                : recommendationCursor
            : null,
          page_size: 100,
          credential_profile: account,
        },
        manifest?.version,
      );
      if (current !== version) return;
      sections[kind].loaded = true;
      if (kind === "artwork") {
        art = more
          ? [...art, ...(result.items as Art[])]
          : (result.items as Art[]);
        artCursor = result.next_cursor;
        if (!localeChosen) {
          const available = new Set(art.map((item) => item.locale));
          const preferred = [
            ...languages.split(",").filter(Boolean),
            ...preferredLanguages(),
            collection.summary?.original_language,
          ].find((locale) => locale && available.has(locale));
          artLocale = preferred ? [preferred] : [];
        }
      } else if (kind === "related") {
        related = more
          ? [...related, ...(result.items as Collection[])]
          : (result.items as Collection[]);
        relatedCursor = result.next_cursor;
      } else {
        recommendations = more
          ? [...recommendations, ...(result.items as Collection[])]
          : (result.items as Collection[]);
        recommendationCursor = result.next_cursor;
      }
    } catch (e) {
      if (current === version)
        sections[kind].error = e instanceof Error ? e.message : String(e);
    } finally {
      if (current === version) sections[kind].loading = false;
    }
  }
  export function showReleases() { tab = "Releases"; }
  export function snapshot(): CollectionInfoSnapshot {
    return {
      identity,
      profile:profileView?.snapshot(),
      account,
      sourceVersion: manifest?.version,
      tab,
      art,
      related,
      recommendations,
      artCursor,
      relatedCursor,
      recommendationCursor,
      sections: $state.snapshot(sections),
      resultLayout,
      active,
      artLocale,
      localeChosen,
    };
  }
  onDestroy(() => version++);
</script>

<section class="collection-info ui-enter">
  {#if metadataError}<div class="v2-alert" role="alert">
      {metadataError}<Button onclick={about}>Retry details</Button>
    </div>{/if}
  {#if collection.summary?.profile}
  <ImageProfile bind:this={profileView} initialState={initialState?.identity===identity && initialState.account===account && initialState.sourceVersion===manifest?.version ? initialState.profile : undefined} {client} {collection} {manifest} {account} {heading} {actions} {oncollection} {ontagsearch} {onimagedownload} {destinations}/>
  {:else}
  <ItemOverview
    {oncollection}
    {ontagsearch}
    media={!!manifest?.media_tools}
    {client}
    {collection}
    {info}
    {detailsLoading}
    {heading}
    {actions}
    {languages}
  />
  {#if channelSections.length}
  <div class="info-tabs channel-tabs" role="group" aria-label="Channel sections">
    {#each channelSections as section}<button aria-pressed={section.reference.id===collection.reference.id} onclick={()=>onsection?.({...collection,reference:section.reference})}>{section.label}</button>{/each}
  </div>
  {#if currentChannelSection?.kind === "collections"}<ChannelCollections {client} {collection} {manifest} {account} {oncollection}/>{:else}{@render children()}{/if}
  {:else if collection.summary?.image}
  {@render children()}
  {:else}
  {#if !isAudioCollection(collection) || supports("artwork") || supports("related") || supports("recommendations")}
  <div class="info-tabs" role="group" aria-label="Item sections">
    <button aria-pressed={tab === "Releases"} onclick={() => (tab = "Releases")}
      >{isAudioCollection(collection) ? "Episodes" : collection.kind === "manga" ? "Chapters" : "Items"}</button
    >
    {#if supports("artwork")}<button
        aria-pressed={tab === "Artwork"}
        onclick={() => {
          tab = "Artwork";
          if (!sections.artwork.loaded && !sections.artwork.loading)
            void load("artwork");
        }}>Artwork</button
      >{/if}
    {#if supports("related")}<button
        aria-pressed={tab === "Related titles"}
        onclick={() => {
          tab = "Related titles";
          if (!sections.related.loaded && !sections.related.loading)
            void load("related");
        }}>Related titles</button
      >{/if}
    {#if supports("recommendations")}<button
        aria-pressed={tab === "Recommendations"}
        onclick={() => {
          tab = "Recommendations";
          if (
            !sections.recommendations.loaded &&
            !sections.recommendations.loading
          )
            void load("recommendations");
        }}>Recommendations</button
      >{/if}
  </div>
  {/if}
  {#if error}<div role="alert" class="v2-alert">
      {error}<Button
        onclick={() =>
          tab === "Releases"
            ? about()
            : load(
                tab === "Artwork"
                  ? "artwork"
                  : tab === "Related titles"
                    ? "related"
                    : "recommendations",
              )}>Retry</Button
      >
    </div>{/if}
  {#key tab}<PendingStatus
      active={loading &&
        !(
          tab === "Artwork"
            ? art
            : tab === "Related titles"
              ? related
              : recommendations
        ).length}
      label={`Loading ${tab.toLowerCase()}…`}
    >
      {#if tab === "Releases"}{@render children()}
      {:else if tab === "Artwork"}
        {#if artLocales.length}<div class="art-filter">
            <ChoicePicker
              label="Cover language"
              options={artLocales}
              empty="All languages"
              bind:value={artLocale}
              preferred={preferredLanguages()}
              onchange={() => (localeChosen = true)}
            />
          </div>{/if}
        <div class="art-grid">
          {#each visibleArt as item}<figure>
              <Artwork
                {client}
                provider={collection.reference.provider}
                url={item.url}
                label={item.label}
              />
              <figcaption>
                {item.label}{#if item.locale}<small
                    >{languageName(item.locale!)}</small
                  >{/if}
              </figcaption>
            </figure>{/each}
        </div>
        {#if !loading && !art.length && !error}<EmptyState
            icon={Image}
            level={3}
            title="No additional artwork"
          />{/if}<InfiniteMore
          cursor={artCursor}
          disabled={loading || !!error}
          load={() => load("artwork", true)}
          label="artwork"
        />
      {:else if (tab === "Related titles" ? related : recommendations).length}
        <div class="related-toolbar">
          <div class="gallery-center">{@render galleryControls?.()}</div>
          <LayoutPicker bind:value={resultLayout} />
        </div>
        <ResultBrowser
          oncontrols={(controls) => (galleryControls = controls)}
          {client}
          accounts={{ [collection.reference.provider]: account }}
          manifests={manifest ? { [manifest.id]: manifest } : {}}
          {languages}
          items={tab === "Related titles" ? related : recommendations}
          layout={resultLayout}
          bind:active
          {loading}
          sources={{ [collection.reference.provider]: manifest?.name ?? "" }}
          hasMore={!!(tab === "Related titles"
            ? relatedCursor
            : recommendationCursor)}
          onmore={() =>
            load(
              tab === "Related titles" ? "related" : "recommendations",
              true,
            )}
          {oncollection}
        />
      {:else if !loading && !error}
        <EmptyState
          icon={BookOpen}
          level={3}
          title={tab === "Related titles"
            ? "No related titles"
            : "No recommendations yet"}
        />
      {/if}
    </PendingStatus>{/key}
  {/if}
  {/if}
</section>

<style>
  .collection-info {
    margin-bottom: var(--theme-collectioninfo-margin-bottom-1, 24px);
  }
  .gallery-center {
    position: absolute;
    left: 50%;
    
    transform: translateX(-50%);
  }
  .related-toolbar {
    position: relative;
    height: var(--theme-collectioninfo-height-2, 36px);
    align-items: center;
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--theme-collectioninfo-margin-bottom-3, 16px);
  }
  .channel-tabs { overflow-x:auto; }
  .channel-tabs button { white-space:nowrap; }
  .info-tabs {
    display: flex;
    gap: var(--theme-collectioninfo-gap-4, 26px);
    border-bottom: var(--theme-collectioninfo-border-bottom-5, 1px) solid var(--line);
    margin-bottom: var(--theme-collectioninfo-margin-bottom-6, 20px);
  }
  .info-tabs button {
    border: 0;
    border-bottom: var(--theme-collectioninfo-border-bottom-7, 2px) solid transparent;
    border-radius: 0;
    background: transparent;
    padding: var(--theme-collectioninfo-padding-8, 12px) var(--theme-collectioninfo-padding-9, 1px);
    font-size: var(--theme-collectioninfo-font-size-10, 14px);
    color: var(--muted);
  }
  .info-tabs button[aria-pressed="true"] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .art-grid {
    display: grid;
    
    grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
    gap: var(--theme-collectioninfo-gap-11, 24px) var(--theme-collectioninfo-gap-12, 18px);
  }
  .art-grid figure {
    margin: 0;
  }
  .art-grid :global(.artwork) {
    height: auto;
    aspect-ratio: 2/3;
    border-radius: var(--theme-collectioninfo-border-radius-13, 8px);
  }
  .art-grid figcaption {
    font-size: var(--theme-collectioninfo-font-size-14, 13px);
    margin-top: var(--theme-collectioninfo-margin-top-15, 9px);
  }
  .art-grid figcaption small {
    display: block;
    margin-top: var(--theme-collectioninfo-margin-top-16, 3px);
    font-size: var(--theme-collectioninfo-font-size-17, 11px);
    color: var(--muted);
  }
  .art-filter {
    max-width: var(--theme-collectioninfo-max-width-18, 260px);
    margin-bottom: var(--theme-collectioninfo-margin-bottom-19, 22px);
  }
  @media (max-width: 1000px) {
    .channel-tabs { overflow-x:auto; }
  .channel-tabs button { white-space:nowrap; }
  .info-tabs {
      gap: var(--theme-collectioninfo-gap-20, 20px);
    }
  }
</style>
