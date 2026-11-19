import type { EngineClient } from "./client";
import {thumbnail,type ImageRendition} from './imageRendition';
import {displayDisk} from './diskCache';
import {publicCacheKey,sourceRevision,registerCacheReset,cacheGeneration} from './displayCache';
registerCacheReset(()=>{clients=new WeakMap();});
let active=0;const queue:(()=>void)[]=[];
async function slot<T>(work:()=>Promise<T>):Promise<T>{if(active<3)active++;else await new Promise<void>(resolve=>queue.push(resolve));try{return await work();}finally{const next=queue.shift();if(next)next();else active--;}}
const rawRequests=new WeakMap<EngineClient,Map<string,Promise<Blob>>>();
function fetchArtwork(client:EngineClient,provider:string,url:string){let pending=rawRequests.get(client);if(!pending)rawRequests.set(client,pending=new Map());const id=JSON.stringify([sourceRevision(client,provider),provider,url]);const existing=pending.get(id);if(existing)return existing;const value=client.artwork(provider,url);pending.set(id,value);void value.finally(()=>{if(pending!.get(id)===value)pending!.delete(id);}).catch(()=>{});return value;}
export type ImageEntry = { blob: Blob; ratio: number };
type Cache = { ready: Map<string, ImageEntry>; pending: Map<string, Promise<ImageEntry>>; bytes: number };
let clients = new WeakMap<EngineClient, Cache>();
const key = (client:EngineClient,provider: string, url: string, rendition:ImageRendition) => JSON.stringify([sourceRevision(client,provider),provider,url,rendition]);
function state(client: EngineClient) { let cache = clients.get(client); if (!cache) clients.set(client, cache = {ready:new Map(),pending:new Map(),bytes:0}); return cache; }
export function cachedArtwork(client: EngineClient | null, provider: string, url?: string | null,rendition:ImageRendition="thumbnail") {
  if (!client || !url) return;
  const cache=state(client), id=key(client,provider,url,rendition), entry=cache.ready.get(id);
  if(entry) { cache.ready.delete(id); cache.ready.set(id,entry); }
  return entry;
}
export function invalidateArtwork(client: EngineClient, provider: string, url: string,rendition:ImageRendition="thumbnail") {
  const cache=state(client), id=key(client,provider,url,rendition), prior=cache.ready.get(id);
  if(prior) cache.bytes-=prior.blob.size;
  cache.ready.delete(id);
  // A failed browser decode must not repeatedly restore the same disk entry.
  void publicCacheKey(client,provider,"artwork",[url,rendition]).then(key=>{if(key)return displayDisk.write(key,"artwork",null,0,0);});
}
// Cache bytes, not object URLs. Each mounted Artwork owns its URL, so eviction
// cannot invalidate a tile, gallery image, or a pending browser decode.
export function loadArtwork(client: EngineClient, provider: string, url: string,rendition:ImageRendition="thumbnail"): Promise<ImageEntry> {
  const cache=state(client), id=key(client,provider,url,rendition), prior=cachedArtwork(client,provider,url,rendition);
  if(prior) return Promise.resolve(prior);
  const pending=cache.pending.get(id); if(pending) return pending;
  const epoch=cacheGeneration;
  const request=slot(async()=>{
    const diskKey=await publicCacheKey(client,provider,'artwork',[url,rendition]);
    const disk=await displayDisk.read<ImageEntry>(diskKey);
    let blob=disk && disk.expires>Date.now() && disk.value?.blob instanceof Blob ? disk.value.blob : await fetchArtwork(client,provider,url);
    let fromDisk=blob===disk?.value?.blob;
    let address=URL.createObjectURL(blob), image=new Image();
    try { image.src=address;
      try{await image.decode();}catch(error){
        if(!fromDisk)throw error;
        void displayDisk.write(diskKey,'artwork',null,0,0);URL.revokeObjectURL(address);
        blob=await fetchArtwork(client,provider,url);address=URL.createObjectURL(blob);image=new Image();image.src=address;await image.decode();fromDisk=false;
      }
      const ratio=image.naturalWidth/image.naturalHeight;
      if(rendition==='thumbnail'&&!fromDisk){try{blob=await thumbnail(blob,image);}catch{/* Keep a valid original if the encoder is unavailable. */}}
      const entry={blob,ratio};
      if(!Number.isFinite(entry.ratio)||entry.ratio<=0) throw new Error('Artwork unavailable');
      if(epoch!==cacheGeneration)return entry;
      cache.ready.set(id,entry); cache.bytes+=blob.size;
      if(!fromDisk)void displayDisk.write(diskKey,'artwork',entry,blob.size,Date.now()+7*24*60*60_000);
      while(cache.ready.size>120 || cache.bytes>24*1024*1024) {
        const oldest=cache.ready.keys().next().value!;
        cache.bytes-=cache.ready.get(oldest)!.blob.size; cache.ready.delete(oldest);
      }
      return entry;
    } finally { URL.revokeObjectURL(address); }
  });
  cache.pending.set(id,request);
  void request.finally(()=>cache.pending.delete(id)).catch(()=>{});
  return request;
}
