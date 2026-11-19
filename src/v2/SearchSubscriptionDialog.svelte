<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import { languageName } from "./languages";
  import type { EngineClient, ProviderManifest, DiscoverySchema, DiscoveryQuery, SelectionPolicy } from "./client";
  let {client,applied,sources,schemas,onclose,oncreated}:{client:EngineClient;applied:Record<string,Record<string,unknown>>;sources:{manifest:ProviderManifest}[];schemas:Record<string,DiscoverySchema>;onclose:()=>void;oncreated:()=>void|Promise<void>}=$props();
  let interval=$state(60), includeExisting=$state(false), saving=$state(false);
  let completed=$state<string[]>([]), errors=$state<Record<string,string>>({});
  const inputs=$derived(Object.entries(applied));
  function criteria(id:string,input:Record<string,unknown>) {
    const options=input.discovery as DiscoveryQuery|undefined, schema=schemas[id];
    const labels=Object.entries(options?.filters??{}).flatMap(([key,values])=>values.map(value=>schema?.filters.find(f=>f.id===key)?.options.find(o=>o.id===value)?.label??value));
    if(options?.sort)labels.push(schema?.sorts.find(s=>s.id===options.sort)?.label??options.sort);
    if(options?.feed)labels.push(schema?.feeds.find(s=>s.id===options.feed)?.label??options.feed);
    const languages=(input.policy as SelectionPolicy|undefined)?.languages??[];
    if(languages.length)labels.push(languages.map(languageName).join(", "));
    return labels.join(" · ");
  }
  async function save() {
    saving=true;errors={};
    for(const [id,input] of inputs) {
      if(completed.includes(id))continue;
      try {
        await client.subscribe({target:{provider:id,id:"saved-search"},search:{query:input.query as string,discovery:(input.discovery as DiscoveryQuery)??null},policy:{languages:[],groups:[],max_height:1080,subtitle_languages:[],automatic_subtitles:false,...(input.policy as Partial<SelectionPolicy>)},action:"notify",destination_id:"",recipe:"cbz",include_existing:includeExisting,interval_minutes:interval,credential_profile:(input.credential_profile as string)??null});
        completed=[...completed,id];
      } catch(e) {errors={...errors,[id]:e instanceof Error?e.message:String(e)};}
    }
    saving=false;
    if(completed.length===inputs.length)await oncreated();
  }
</script>
<Dialog title="Subscribe to search" onclose={()=>{if(!saving)onclose();}}>
  <p class="query">“{inputs[0]?.[1].query}”</p>
  <div class="search-sources">
    {#each inputs as [id,input]}<div><strong>{sources.find(s=>s.manifest.id===id)?.manifest.name??id}</strong>{#if criteria(id,input)}<p>{criteria(id,input)}</p>{/if}{#if input.credential_profile}<small>Uses the account selected for this search.</small>{/if}{#if completed.includes(id)}<small>Subscribed</small>{/if}{#if errors[id]}<p role="alert">{errors[id]}</p>{/if}</div>{/each}
  </div>
  <p>New matches appear in Overview. Open a match to view its details and choose what to download.</p>
  <SelectPicker label="Check for new matches" bind:value={interval} disabled={saving} options={[{id:15,label:"Every 15 minutes"},{id:60,label:"Every hour"},{id:360,label:"Every 6 hours"},{id:1440,label:"Every day"}]}/>
  <label class="v2-check"><input type="checkbox" bind:checked={includeExisting} disabled={saving}/>Include current results</label>
  <p class="hint">{includeExisting ? "The first check will add existing matches too." : "The first check establishes the starting point. You’ll see matches found after that."}</p>
  {#snippet footer()}<Button variant="primary" disabled={saving||!inputs.length} onclick={save}>{saving?"Subscribing…":Object.keys(errors).length?"Retry remaining":"Subscribe"}</Button>{/snippet}
</Dialog>
<style>
  .query {font-weight:var(--theme-searchsubscriptiondialog-font-weight-1, 650);color:var(--text);overflow-wrap:anywhere;}
  .search-sources {display:grid;gap:var(--theme-searchsubscriptiondialog-gap-2, 12px);padding:var(--theme-searchsubscriptiondialog-padding-3, 16px);border:var(--theme-searchsubscriptiondialog-border-4, 1px) solid var(--line);border-radius:var(--theme-searchsubscriptiondialog-border-radius-5, 10px);}
  .search-sources p,.search-sources small {display:block;margin-top:var(--theme-searchsubscriptiondialog-margin-top-6, 4px);font-size:var(--theme-searchsubscriptiondialog-font-size-7, 12px);}
  .hint {font-size:var(--theme-searchsubscriptiondialog-font-size-7, 12px);}
</style>
