<script lang="ts">
 import { appLocale } from "./locale";
 import {onDestroy,untrack} from 'svelte';
 import Dialog from './Dialog.svelte';
 import Button from './ui/Button.svelte';
 import SelectPicker from './SelectPicker.svelte';
 import {Plus,Check,X} from 'lucide-svelte';
 function tagName(label:string){return label.replace(/ · \d+ posts$/,'');}
 function tagCount(label:string){const count=/ · (\d+) posts$/.exec(label);return count ? `${Intl.NumberFormat(appLocale(),{notation:'compact',maximumFractionDigits:1}).format(Number(count[1]))} posts` : '';}
 import type {EngineClient,DiscoverySchema,DiscoveryOption} from './client';
 let {client,sources,accounts,onsearch,onclose}:{client:EngineClient;sources:{id:string;name:string}[];accounts:Record<string,string|null>;onsearch:(source:string,tags:string[])=>void;onclose:()=>void}=$props();
 let source=$state(untrack(()=>sources[0]?.id??'')),query=$state(''),suggestions=$state<DiscoveryOption[]>([]),chosen=$state<DiscoveryOption[]>([]),loading=$state(false),error=$state(''),revision=$state(0),generation=0;
 $effect(()=>{void source;chosen=[];});
 $effect(()=>{const p=source,q=query;void revision;const version=++generation;loading=true;error='';suggestions=[];const timer=setTimeout(async()=>{try{const result=await client.operation<DiscoverySchema>(p,{operation:'discovery',query:q,credential_profile:accounts[p]??null});if(version===generation)suggestions=result.tags??[];}catch(e){if(version===generation)error=e instanceof Error?e.message:String(e);}finally{if(version===generation)loading=false;}},q?250:0);return()=>clearTimeout(timer);});
 onDestroy(()=>generation++);
</script>
<Dialog title="Find tags" {onclose}>
 {#if sources.length>1}<SelectPicker label="Source" options={sources.map(s=>({id:s.id,label:s.name}))} bind:value={source}/>{/if}
 <label class="tag-query">Tag name<input type="search" bind:value={query} placeholder="Start typing a tag"/></label>
 {#if chosen.length}<div class="chosen" aria-label="Selected tags">{#each chosen as tag}<button aria-label={`Remove ${tag.id}`} onclick={()=>chosen=chosen.filter(t=>t.id!==tag.id)}>{tagName(tag.label)}<X size={14} aria-hidden="true"/></button>{/each}</div>{/if}
 <div class="suggestions" aria-live="polite" aria-busy={loading}>
  {#if loading}<p>Finding tags…</p>{:else if error}<p role="alert">{error}</p><Button onclick={()=>revision++}>Retry</Button>{:else}
   <p>{query?'Matching tags':'Popular tags'}</p>
   {#each suggestions as tag}<button class="tag-option" aria-label={`${chosen.some(t=>t.id===tag.id)?"Added":"Add"} ${tagName(tag.label)}`} disabled={chosen.some(t=>t.id===tag.id)} onclick={()=>{chosen=[...chosen,tag];query='';}}><span class="tag-name">{tagName(tag.label)}</span>{#if tagCount(tag.label)}<small>{tagCount(tag.label)}</small>{/if}{#if chosen.some(t=>t.id===tag.id)}<Check size={16} aria-hidden="true"/>{:else}<Plus size={16} aria-hidden="true"/>{/if}</button>{:else}<p>No matching tags. Try another word.</p>{/each}
  {/if}
 </div>
 {#snippet footer()}<Button variant="primary" disabled={!chosen.length} onclick={()=>{onsearch(source,chosen.map(t=>t.id));onclose();}}>Search {chosen.length===1?'tag':'tags'}</Button>{/snippet}
</Dialog>
<style>.tag-query{display:grid;gap:8px}.chosen{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chosen button{display:flex;gap:12px;align-items:center;padding:6px 10px;background:var(--surface-soft);border:1px solid var(--line);border-radius:6px;color:var(--text)}.suggestions{height:min(340px,42vh);overflow:auto;scrollbar-gutter:stable;padding-right:12px;margin-top:4px}.suggestions p{font-size:13px;color:var(--muted);margin:0 0 10px}.tag-option{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;background:none;border:0;min-height:44px;padding:10px 8px;text-align:left;color:var(--text);border-bottom:1px solid var(--line)}.tag-option:hover{background:var(--surface-soft)}.tag-name{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}.tag-option small{white-space:nowrap;font-size:12px;color:var(--muted)}.tag-option :global(svg){flex-shrink:0;color:var(--muted)}.tag-option:disabled{opacity:.5}</style>
