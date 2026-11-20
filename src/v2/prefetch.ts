import { itemMetadata } from './itemCache';
import { sectionPage } from './sectionCache';
import { isAudioCollection } from './mediaPresentation';
import { loadOutputPreferences } from './outputPreferences';
import type { Collection, EngineClient, ProviderManifest } from './client';
let timer:ReturnType<typeof setTimeout>|undefined,active=0;
export function cancelIntentPrefetch(){clearTimeout(timer);}
// One pointed-to item, at most two active intent prefetches. Never fan out over
// installed sources, change selected output options, or prepare a download.
export function intentPrefetch(client:EngineClient,item:Collection,source:ProviderManifest,account:string|null) {
  cancelIntentPrefetch();
  if((navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData)return;
  timer=setTimeout(()=>{
    if(active>=2||document.visibilityState==='hidden')return;
    active++;
    void (async()=>{
      const jobs:Promise<unknown>[]=[];
      if(!item.summary||!item.description)jobs.push(itemMetadata(client,item,'collection',account));
      if(source.capabilities.includes('details'))jobs.push(itemMetadata(client,item,'details',account));
      if(source.media_tools && source.capabilities.includes('releases') && item.kind!=='item' && !item.summary?.image && !item.summary?.profile){
        const saved=loadOutputPreferences(isAudioCollection(item)?'audio':'video');
        jobs.push(sectionPage(client,source.id,{operation:'releases',reference:item.reference,page_size:100,cursor:null,release_order:isAudioCollection(item)?'desc':null,credential_profile:account,policy:{languages:[],groups:[],max_height:saved.maxHeight??1080,subtitle_languages:[...new Set((saved.subtitles??'').split(',').map(s=>s.trim()).filter(Boolean))],automatic_subtitles:saved.automaticSubtitles??false}},source.version));
      }
      await Promise.allSettled(jobs);
    })().finally(()=>active--);
  },120);
}
