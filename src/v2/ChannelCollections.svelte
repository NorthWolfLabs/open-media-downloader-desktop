<script lang="ts">
 import {onDestroy} from 'svelte';
 import type {Collection,EngineClient,ProviderManifest} from './client';
 import ResultBrowser from './ResultBrowser.svelte';
 import LayoutPicker,{type ResultLayout} from './LayoutPicker.svelte';
 import EmptyState from './ui/EmptyState.svelte';
 import Button from './ui/Button.svelte';
 import {sectionPage} from './sectionCache';
 let {client,collection,manifest,account,oncollection}:{client:EngineClient;collection:Collection;manifest?:ProviderManifest;account:string|null;oncollection:(c:Collection)=>void}=$props();
 let items=$state<Collection[]>([]),cursor=$state<string|null>(null),loading=$state(false),error=$state(''),layout=$state<ResultLayout>('grid');let generation=0;
 async function load(more=false){const version=generation;loading=true;error='';try{const page=await sectionPage<Collection>(client,collection.reference.provider,{operation:'browse',reference:collection.reference,credential_profile:account,cursor:more?cursor:null,page_size:30},manifest?.version);if(version!==generation)return;items=more?[...items,...page.items]:page.items;cursor=page.next_cursor;}catch(e){if(version===generation)error=e instanceof Error?e.message:String(e);}finally{if(version===generation)loading=false;}}
 $effect(()=>{void collection.reference;void account;generation++;items=[];cursor=null;void load();});onDestroy(()=>generation++);
</script>
<div class="collection-layout"><LayoutPicker bind:value={layout} storageKey="omd.channel-collections-layout" /></div>
{#if error}<div role="alert" class="v2-alert">{error}<Button onclick={()=>load()}>Retry</Button></div>{/if}
<ResultBrowser {client} {items} {layout} {loading} hasMore={!!cursor} onmore={()=>load(true)} {oncollection} accounts={{[collection.reference.provider]:account}} sources={{[collection.reference.provider]:manifest?.name??''}} manifests={manifest?{[manifest.id]:manifest}:{}} />
{#if !loading && !error && !items.length}<EmptyState title="No collections in this section" />{/if}
<style>.collection-layout{display:flex;justify-content:flex-end;margin-bottom:var(--theme-channelcollections-margin-bottom-1, 16px)}</style>
