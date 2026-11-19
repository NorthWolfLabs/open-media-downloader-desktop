<script lang="ts">
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import ItemOverview from "./ItemOverview.svelte";
  import Button from "./ui/Button.svelte";
  import { mainItem, cachedItemMetadata } from "./itemCache";
  import type { Collection, CollectionDetails, EngineClient } from "./client";
  let {
    client,
    collection,
    source,
    media = false,
    account = null,
    languages = "",
    supportsDetails = false,
    oncollection,
    ontagsearch,
    selection,
  }: {
    selection?: Snippet<[Collection]>;
    client: EngineClient;
    collection: Collection;
    source: string;
    media?: boolean;
    account?: string | null;
    languages?: string;
    supportsDetails?: boolean;
    oncollection: (item: Collection) => void;
    ontagsearch?: (provider:string,tag:string)=>void;
  } = $props();
  let item = $state<Collection>(untrack(() => collection));
  let info = $state<CollectionDetails | null>(null);
  let loading = $state(false);
  let error = $state("");
  let retry = $state(0);
  $effect(() => {
    const selected = collection;
    const profile = account;
    void retry;
    let active = true;
    item = selected;
    const cached =
      cachedItemMetadata<CollectionDetails>(
        client,
        selected,
        "details",
        profile,
      ) ?? null;
    info = cached;
    loading = !cached && (supportsDetails || !selected.description);
    error = "";
    void mainItem(client, selected, supportsDetails, profile).then((result) => {
      if (!active) return;
      item = result.collection;
      info = result.info;
      loading = false;
      if (supportsDetails && !info)
        error = "Additional details could not be loaded.";
    });
    return () => {
      active = false;
    };
  });
</script>

<ItemOverview
    {oncollection}
    {ontagsearch}
  {client}
  {media}
  collection={item}
  {info}
  detailsLoading={loading}
  {languages}
  gallery
>
  {#snippet heading()}<small>{source}</small>
    <h2>{item.title}</h2>{/snippet}
  {#snippet actions()}<Button
      variant="primary"
      onclick={() => oncollection(item)}>View details</Button
    >
    {@render selection?.(collection)}
    {#if error}<p role="status">
        {error}
        <Button variant="ghost" onclick={() => retry++}>Retry</Button>
      </p>{/if}
  {/snippet}
</ItemOverview>

<style>
  small {
    color: var(--muted);
    font-size: var(--theme-galleryitem-font-size-1, 12px);
  }
  h2 {
    font-size: var(--theme-galleryitem-font-size-2, 24px);
    line-height: var(--theme-galleryitem-line-height-3, 1.3);
    margin-top: var(--theme-galleryitem-margin-top-4, 4px);
  }
  p {
    font-size: var(--theme-galleryitem-font-size-1, 12px);
  }
</style>
