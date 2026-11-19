<script lang="ts">
 import {type Snippet} from 'svelte';
 import Artwork from './Artwork.svelte';
 import {loadArtwork} from './artworkCache';
 import SourceBadge from './SourceBadge.svelte';
 import Button from './ui/Button.svelte';
 import {ChevronLeft,ChevronRight} from 'lucide-svelte';
 import {publishedAge} from './mediaPresentation';
 import type {Collection,CollectionDetails,EngineClient,DiscoveryOption} from './client';
 let {client,collection,info,heading,actions,gallery=false,detailsLoading=false,oncollection,ontagsearch}:{client:EngineClient;collection:Collection;info:CollectionDetails|null;heading?:Snippet;actions?:Snippet;gallery?:boolean;detailsLoading?:boolean;oncollection?:(item:Collection)=>void;ontagsearch?:(provider:string,tag:string)=>void}=$props();
 let page=$state(0);
 const image=$derived(collection.summary!.image!);
 const previews=$derived(image.previews?.length?image.previews:[collection.artwork_url].filter((u):u is string=>!!u));
 $effect(()=>{void collection.reference.id;page=0;});
 const tags=$derived<DiscoveryOption[]>(info?.tags??(collection.summary?.tags??[]).map(label=>({id:label,label})));
 const facts=$derived((info?.facts??[]).filter(f=>!['Published','Images'].includes(f.label) && (page===0 || !['Dimensions','Format'].includes(f.label))));
 $effect(()=>{for(const url of [previews[page-1],previews[page+1]])if(url)void loadArtwork(client,collection.reference.provider,url,"original").catch(()=>{});});
</script>
<section class="image-overview" class:gallery>
 <div class="image-pane">
  <!-- ImageSummary opts into exact source-provided image previews; cards use separate thumbnails. -->
  <div class="image-stage"><Artwork fitted rendition="original" {client} provider={collection.reference.provider} url={previews[page]} label={collection.title}/></div>
  {#if image.count>1}<div class="page-navigation" role="group" aria-label="Images in this post"><Button icon aria-label="Previous image" disabled={page===0} onclick={()=>page--}><ChevronLeft size={18}/></Button><span>Image {page+1} of {image.count}</span><Button icon aria-label="Next image" disabled={page+1>=previews.length} onclick={()=>page++}><ChevronRight size={18}/></Button></div>{/if}
  {#if detailsLoading}<small role="status">Loading post details…</small>{:else if image.count>previews.length}<small>{previews.length === 1 ? "1 preview available" : `${previews.length} previews available`}. Downloads include all {image.count} images.</small>{/if}
 </div>
 <div class="image-information">
  <div class="image-heading">{@render heading?.()}</div>
  <div class="creator-links">{#if collection.summary?.creator_links?.length}{#each collection.summary.creator_links as creator}<span><small>{creator.role}</small><button class="internal-link" onclick={()=>oncollection?.({...creator.collection,artwork_url:null,description:null})}>{creator.collection.title}</button></span>{/each}{:else}{#each info?.creators??[] as creator}<span><small>{creator.label}</small>{creator.values.join(' · ')}</span>{/each}{/if}</div>
  <div class="image-actions">{@render actions?.()}</div>
  {#if info?.description || collection.description}<details class="description"><summary>Description</summary><p>{info?.description || collection.description}</p></details>{/if}
  <dl class="image-facts"><div><dt>Images</dt><dd>{image.count}</dd></div>{#if collection.summary?.published_label}<div><dt>Published</dt><dd title={collection.summary.published_label}>{publishedAge(collection.summary.published_label)}</dd></div>{/if}{#each facts as fact}<div><dt>{fact.label}</dt><dd>{fact.values.join(' · ')}</dd></div>{/each}</dl>
  {#if tags.length}<div class="image-tags" aria-label="Tags">{#each tags as tag}{#if ontagsearch}<button aria-label={`Search tag ${tag.label}`} onclick={()=>ontagsearch?.(collection.reference.provider,tag.id)}><SourceBadge label={tag.label} appearance={tag.appearance}/></button>{:else}<SourceBadge label={tag.label}/>{/if}{/each}</div>{/if}
 </div>
</section>
<style>
 .image-overview{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,1fr);gap:28px;align-items:start;margin-bottom:28px;}
 .image-pane{min-width:0;min-height:0;}
 .image-stage{height:clamp(280px,65vh,760px);display:grid;place-items:center;background:var(--surface);border-radius:var(--theme-itemoverview-border-radius-46,8px);overflow:hidden;}
 .image-stage :global(.artwork){width:100%;height:100%;min-height:0;}
 .image-stage :global(.artwork img){max-width:100%;max-height:100%;object-fit:contain;object-position:center;}
 .page-navigation{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:12px;font-size:13px;color:var(--muted);}
 .image-pane>small{display:block;text-align:center;margin-top:8px;color:var(--muted);}
 .image-information{min-width:0;display:flex;flex-direction:column;gap:18px;}
 .image-heading :global(h1),.image-heading :global(h2){overflow:visible;max-height:none;-webkit-line-clamp:unset;line-clamp:unset;overflow-wrap:anywhere;}
 .creator-links{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;}
 .creator-links>span{display:flex;align-items:center;gap:8px;}
 small,dt{color:var(--muted);font-size:12px;}
 .internal-link{border:0;background:none;padding:0;font:inherit;color:var(--text);text-decoration:underline;text-underline-offset:3px;cursor:pointer;}
 .internal-link:hover{color:var(--accent-text);}
 .image-actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center;}
 .description{font-size:13px;color:var(--muted);}summary{cursor:pointer;color:var(--text);}p{white-space:pre-line;overflow-wrap:anywhere;line-height:1.6;max-height:220px;overflow:auto;scrollbar-gutter:stable;padding-right:12px;}
 .image-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:16px;margin:0;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
 dd{margin:5px 0 0;font-size:13px;overflow-wrap:anywhere;}
 .image-tags{display:flex;flex-wrap:wrap;align-items:start;gap:6px;}
 .image-tags button{border:0;padding:0;background:none;max-width:100%;cursor:pointer;}
 .image-tags :global(.source-badge){white-space:normal;overflow:visible;overflow-wrap:anywhere;text-align:left;}
 .image-tags button:hover :global(.source-badge){color:var(--accent-text);}
 .gallery{height:100%;margin:0;grid-template-columns:minmax(0,1.35fr) minmax(280px,1fr);overflow:hidden;}
 .gallery .image-pane{height:100%;display:flex;flex-direction:column;}
 .gallery .image-stage{height:auto;flex:1;min-height:0;}
 .gallery .image-information{max-height:100%;overflow-y:auto;scrollbar-gutter:stable;padding-right:12px;padding-bottom:16px;}
 @media(max-width:750px){.image-overview{grid-template-columns:1fr;gap:20px;}.gallery{overflow:auto;display:block;}.gallery .image-pane{height:55%;min-height:240px;}.gallery .image-information{overflow:visible;max-height:none;margin-top:20px;}.image-stage{height:55vh;}}
</style>
