<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { Blocks, Search, ChevronRight, RefreshCw } from 'lucide-svelte';
  import Artwork from './Artwork.svelte';
  import PendingStatus from './ui/PendingStatus.svelte';
  import { sectionPage, cachedSectionPage } from './sectionCache';
  import { intentPrefetch, cancelIntentPrefetch } from './prefetch';
  import Button from './ui/Button.svelte';
  import SelectPicker from './SelectPicker.svelte';
  import AccountPicker from './AccountPicker.svelte';
  import { artworkKind, isAudioCollection } from './mediaPresentation';
  import type { EngineClient, ProviderManifest, Collection, DiscoverySchema, DiscoveryQuery } from './client';
  let {client,sources,selected,onselect,oncollection,onsearch,accounts,languages,schemas={},options={},onfeed,accountRevision=0,directory=$bindable()}:
    {client:EngineClient;sources:{manifest:ProviderManifest;digest?:string}[];selected:string;onselect:(id:string)=>void;oncollection:(item:Collection)=>void;onsearch:()=>void;accounts:Record<string,string|null>;languages:string;schemas?:Record<string,DiscoverySchema>;options?:Record<string,DiscoveryQuery>;onfeed:(id:string,feed:string)=>void;accountRevision?:number;directory?:{query:string;scroll:number}}=$props();
  let sourceQuery=$state(untrack(()=>directory?.query??'')),items=$state<Collection[]>([]),cursor=$state<string|null>(null),loading=$state(false),error=$state('');
  let generation=0;
  let sourceNav=$state<HTMLElement>();
  $effect(()=>{if(directory)directory.query=sourceQuery;});
  $effect(()=>{if(sourceNav)sourceNav.scrollTop=untrack(()=>directory?.scroll??0);});
  const source=$derived(sources.find(s=>s.manifest.id===selected)?.manifest);
  const filteredSources=$derived(sources.filter(s=>s.manifest.name.toLocaleLowerCase().includes(sourceQuery.toLocaleLowerCase())));
  const feeds=$derived(schemas[selected]?.feeds ?? []);
  const revision=$derived(sources.find(s=>s.manifest.id===selected)?.digest??source?.version??" ");
  function request(cursor:string|null){return {operation:"browse",query:"",page_size:48,cursor,credential_profile:accounts[selected]??null,policy:{languages:languages.split(",").map(s=>s.trim()).filter(Boolean)},discovery:structuredClone($state.snapshot(options[selected]??{filters:{},sort:null,feed:null}))};}
  async function load(more=false,refresh=false) {
    const current=more?generation:++generation;
    const manifest=source;
    if(!manifest){items=[];cursor=null;loading=false;error="";return;}
    if(!more){const cached=cachedSectionPage<Collection>(client,manifest.id,request(null),revision);items=cached?.items??(refresh?items:[]);cursor=cached?.next_cursor??null;} error='';
    if(!manifest.capabilities.includes('browse')){loading=false;return;}
    loading=true;const before=cursor;
    try {
      const page=await sectionPage<Collection>(client,manifest.id,request(more?cursor:null),revision,{refresh,onCached:page=>{if(current===generation&&!more){items=page.items;cursor=page.next_cursor;}}});
      if(current!==generation)return;
      if(more && page.next_cursor && page.next_cursor===before)throw new Error('The source repeated a catalog page.');
      const seen=new Set(items.map(i=>JSON.stringify(i.reference)));
      items=more?[...items,...page.items.filter(i=>{const id=JSON.stringify(i.reference);if(seen.has(id))return false;seen.add(id);return true;})]:page.items;cursor=page.next_cursor;
    } catch(e){if(current===generation)error=e instanceof Error?e.message:'The catalog could not be loaded.';}
    finally {if(current===generation)loading=false;}
  }
  $effect(()=>{void source?.id;void source?.version;void revision;void accounts[selected];void accountRevision;void languages;void JSON.stringify(options[selected]);untrack(()=>void load());});
  onDestroy(()=>{generation++;cancelIntentPrefetch();});
</script>

<div class="catalog-browser" class:single={sources.length===1}>
  {#if sources.length>1}
    <aside class="source-library" aria-label="Browse sources">
      <header><h2>Browse</h2><span>{sources.length}</span></header>
      {#if sources.length>6}<label class="source-filter"><Search size={15}/><input aria-label="Find a source" type="search" placeholder="Find a source" bind:value={sourceQuery}/></label>{/if}
      <nav aria-label="Source catalogs" bind:this={sourceNav} onscroll={()=>{if(directory&&sourceNav?.clientHeight)directory.scroll=sourceNav.scrollTop;}}>
        {#each filteredSources as entry (entry.manifest.id)}<button type="button" aria-current={selected===entry.manifest.id?'page':undefined} title={entry.manifest.name} onclick={()=>onselect(entry.manifest.id)}><Blocks size={17}/><span>{entry.manifest.name}</span></button>{:else}<p>No matching sources</p>{/each}
      </nav>
    </aside>
    <div class="mobile-source"><SelectPicker label="Browse" value={selected} options={sources.map(s=>({id:s.manifest.id,label:s.manifest.name}))} onchange={onselect}/></div>
  {/if}
  <section class="catalog-content" aria-label="Source catalog">
    <header class="catalog-heading"><h2>{sources.length===1?'Browse':source?.name??'Choose a source'}</h2><Button variant="ghost" icon aria-label="Refresh catalog" disabled={loading} onclick={()=>load(false,true)}><RefreshCw size={16}/></Button></header>
    {#if source?.grants.some(g=>g.credential)}<AccountPicker {client} provider={selected} bind:value={accounts[selected]} revision={accountRevision}/>{/if}
    {#if feeds.length}<SelectPicker label="Feed" value={options[selected]?.feed??''} options={[{id:'',label:'Source default'},...feeds]} onchange={v=>onfeed(selected,v)}/>{/if}
    {#if error}<div class="catalog-message" role="alert"><p>{error}</p><Button onclick={()=>load(false,true)}>Retry catalog</Button></div>{/if}
    <PendingStatus active={loading && !items.length} label="Loading catalog…"/>
    {#if source && !source.capabilities.includes('browse')}<div class="catalog-message"><p>This source supports search or direct links.</p><Button onclick={onsearch}>Search this source</Button></div>{/if}
    <div class="catalog-list">
      {#each items as item (`${item.reference.provider}:${item.reference.id}`)}<button class="catalog-item" onpointerenter={()=>intentPrefetch(client,item,source!,accounts[selected]??null)} onpointerleave={cancelIntentPrefetch} onfocus={()=>intentPrefetch(client,item,source!,accounts[selected]??null)} onblur={cancelIntentPrefetch} onclick={()=>{cancelIntentPrefetch();oncollection(item);}}>
        <div class="catalog-cover"><Artwork {client} provider={item.reference.provider} url={item.artwork_url} label={item.title} kind={artworkKind(item)}/></div>
        <span class="catalog-copy"><strong>{item.title}</strong><span class="catalog-facts">{isAudioCollection(item)?'Podcast':item.kind==='manga'?'Books & comics':item.kind==='channel'?'Channel':'Collection'}{#if item.summary?.video_count_label}{" · "}{item.summary.video_count_label}{/if}</span>{#if item.description}<span class="catalog-description">{item.description}</span>{/if}</span><ChevronRight size={18}/>
      </button>{/each}
    </div>
    {#if !loading && !error && source?.capabilities.includes('browse') && !items.length}<p class="catalog-message">No catalog items are available from this source.</p>{/if}
    {#if cursor}<div class="catalog-more"><Button disabled={loading} onclick={()=>load(true)}>{loading?'Loading…':'Load more'}</Button></div>{/if}
  </section>
</div>
<style>
.catalog-browser{display:grid;grid-template-columns:220px minmax(0,1fr);gap:28px;margin-top:24px;container-type:inline-size}.catalog-browser.single{grid-template-columns:minmax(0,1fr)}
.source-library{min-width:0}.source-library header,.catalog-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.source-library h2,.catalog-heading h2{font-size:var(--type-heading);margin:0}.source-library header span{color:var(--muted);font-size:12px}.source-filter{display:flex;align-items:center;gap:8px;border:1px solid var(--line-strong);border-radius:var(--control-radius);padding:0 10px;margin-bottom:10px}.source-filter input{width:100%;min-width:0;border:0;background:none;padding-inline:0}.source-library nav{max-height:min(520px,calc(100vh - 260px));overflow:auto;display:grid;align-content:start;gap:3px}.source-library nav button{display:flex;align-items:center;justify-content:flex-start;gap:10px;min-width:0;min-height:40px;text-align:left;border:0;border-radius:var(--control-radius);padding:9px 10px;background:none}.source-library nav button :global(svg){flex-shrink:0;color:var(--muted)}.source-library nav button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-library nav button:hover{background:var(--surface-soft)}.source-library nav button[aria-current=page],.source-library nav button[aria-current=page]:hover{background:var(--selection-bg);color:var(--text)}
.catalog-content{min-width:0}.catalog-heading h2{overflow-wrap:anywhere}.catalog-list{display:grid;gap:10px}.catalog-item{width:100%;display:grid;grid-template-columns:64px minmax(0,1fr) 18px;gap:16px;align-items:center;text-align:left;padding:16px;border:1px solid var(--line);border-radius:var(--panel-radius);background:var(--surface);color:var(--text)}.catalog-item:hover{background:var(--surface-raised);border-color:var(--line-strong)}.catalog-item:active{background:var(--surface-soft)}.catalog-cover{width:64px;height:64px;border-radius:10px;overflow:hidden;background:var(--surface-soft)}.catalog-cover :global(.artwork){width:100%;height:100%;border-radius:10px}.catalog-cover :global(img){object-fit:cover}.catalog-copy{display:grid;min-width:0;gap:5px}.catalog-copy strong{font-size:var(--type-heading);overflow-wrap:anywhere}.catalog-facts{font-size:12px;color:var(--muted)}.catalog-description{font-size:13px;color:var(--muted);line-height:1.5;display:-webkit-box;line-clamp:2;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.catalog-message{padding:20px 0;color:var(--muted);display:grid;gap:12px}.catalog-more{display:flex;justify-content:center;padding:20px}.mobile-source{display:none}
@media(max-width:1000px){.catalog-browser{grid-template-columns:minmax(0,1fr);gap:16px}.source-library{display:none}.mobile-source{display:block}.catalog-item{grid-template-columns:56px minmax(0,1fr) 16px;gap:12px;padding:12px}.catalog-cover{width:56px;height:56px}}

:global(:root[data-appearance="macos"]:not([data-window="inactive"])) .source-library nav button[aria-current=page],
:global(:root[data-appearance="macos"]:not([data-window="inactive"])) .source-library nav button[aria-current=page]:hover{background:var(--accent);color:var(--accent-contrast)}
:global(:root[data-appearance="macos"]:not([data-window="inactive"])) .source-library nav button[aria-current=page] :global(svg){color:var(--accent-contrast)}
@media(forced-colors:active){.catalog-item{background:Canvas;border-color:ButtonBorder;color:CanvasText}.catalog-item:hover{background:Highlight;color:HighlightText}.catalog-item:hover .catalog-facts,.catalog-item:hover .catalog-description{color:HighlightText}.source-library nav button[aria-current=page],.source-library nav button[aria-current=page]:hover{background:Highlight!important;color:HighlightText!important}.source-library nav button[aria-current=page] :global(svg){color:HighlightText!important}}
</style>
