<script lang="ts">
  import { appLocale } from "./locale";
  import type {Snippet} from 'svelte';
  import type {Collection,EngineClient} from './client';
  import Artwork from './Artwork.svelte';
  import Button from './ui/Button.svelte';
  let {client,collection,heading,actions}:{client:EngineClient;collection:Collection;heading?:Snippet;actions?:Snippet}=$props();
  let expanded=$state(false);
  const summary=$derived(collection.summary);
</script>
<section class="channel-overview">
  {#if summary?.banner_url}<div class="channel-banner"><Artwork {client} provider={collection.reference.provider} url={summary.banner_url} label={`${collection.title} banner`} /></div>{/if}
  <div class="channel-identity">
    {#if summary?.avatar_url}<div class="channel-avatar"><Artwork {client} provider={collection.reference.provider} url={summary.avatar_url} avatar label={collection.title} /></div>{/if}
    <div class="channel-copy">
      {@render heading?.()}
      {#if summary?.handle || summary?.followers != null || summary?.video_count_label}<div class="channel-facts">
        {#if summary.handle}<span>{summary.handle}</span>{/if}
        {#if summary.followers != null}<span>{Intl.NumberFormat(appLocale(),{notation:'compact'}).format(summary.followers)} subscribers</span>{/if}
        {#if summary.video_count_label}<span>{summary.video_count_label}</span>{/if}
      </div>{/if}
      {#if collection.description}<p class:clamped={!expanded}>{expanded ? collection.description : collection.description.replace(/\s+/g," ").trim()}</p>
        {#if collection.description.length>180}<Button variant="ghost" class="channel-more" aria-expanded={expanded} onclick={()=>expanded=!expanded}>{expanded?'Show less':'About this channel'}</Button>{/if}
      {/if}
      <div class="channel-actions">{@render actions?.()}</div>
    </div>
  </div>
</section>
<style>
.channel-overview{min-width:0;margin-bottom:var(--theme-channeloverview-margin-bottom-1, 20px)}
.channel-banner{width:100%;aspect-ratio:6/1;max-height:var(--theme-channeloverview-max-height-2, 240px);min-height:var(--theme-channeloverview-min-height-3, 90px);margin-bottom:var(--theme-channeloverview-margin-bottom-4, 24px)}
.channel-banner :global(.artwork){height:100%;width:100%;border-radius:var(--theme-channeloverview-border-radius-5, 12px);overflow:hidden}
.channel-banner :global(img){width:100%;height:100%;object-fit:cover}
.channel-identity{display:flex;align-items:flex-start;gap:var(--theme-channeloverview-gap-6, 24px)}
.channel-avatar{width:var(--theme-channeloverview-width-7, 112px);height:var(--theme-channeloverview-height-8, 112px);flex-shrink:0}
.channel-avatar :global(.artwork){width:100%;height:100%;border-radius:50%;overflow:hidden}
.channel-avatar :global(img){width:100%;height:100%;object-fit:cover}
.channel-copy{min-width:0;flex:1}.channel-copy :global(.v2-source-name){display:none}
.channel-facts{display:flex;flex-wrap:wrap;gap:var(--theme-channeloverview-gap-9, 6px) var(--theme-channeloverview-gap-10, 14px);color:var(--muted);font-size:var(--theme-channeloverview-font-size-11, 13px);margin:var(--theme-channeloverview-margin-12, 8px) 0}
p{white-space:pre-line;line-height:var(--theme-channeloverview-line-height-13, 1.55);color:var(--muted);margin:var(--theme-channeloverview-margin-14, 10px) 0;max-width:var(--theme-channeloverview-max-width-15, 900px)}.clamped{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.channel-actions{margin-top:var(--theme-channeloverview-margin-top-16, 12px)}.channel-copy :global(.channel-more){padding:0;min-height:var(--theme-channeloverview-min-height-17, 24px);font-size:var(--theme-channeloverview-font-size-11, 13px)}
@media(max-width:700px){.channel-avatar{width:var(--theme-channeloverview-width-18, 72px);height:var(--theme-channeloverview-height-19, 72px)}.channel-identity{gap:var(--theme-channeloverview-gap-20, 16px)}.channel-banner{margin-bottom:var(--theme-channeloverview-margin-bottom-21, 18px)}.channel-copy :global(h1){font-size:var(--theme-channeloverview-font-size-22, 23px)}}
</style>
