import type { EngineClient, Page } from "./client";
import { displayDisk } from './diskCache';
import { publicCacheKey, sourceRevision, stable, registerCacheReset, cacheGeneration } from './displayCache';
registerCacheReset(()=>{caches=new WeakMap();});
// Bounded FIFO, separated by engine, source version, account, policy and order.
// Only successful read pages are retained. Downloads always verify live state.
let caches = new WeakMap<EngineClient, Map<string, Map<string, Entry>>>();
type Entry = {
  expires: number;
  value: Promise<Page<unknown>>;
  resolved?: Page<unknown>;
  bytes: number;
};
const MAX_TITLES = 24,
  MAX_BYTES = 16 * 1024 * 1024,
  MAX_PAGES = 80;
export function clearSectionCache(client: EngineClient) {
  caches.delete(client);
}
function cacheTitle(client:EngineClient,provider:string,request:Parameters<EngineClient["operation"]>[1],revision:string){return stable([provider,sourceRevision(client,provider,revision),request.reference,request.credential_profile??null]);}
export function cachedSectionPage<T>(client:EngineClient,provider:string,request:Parameters<EngineClient["operation"]>[1],revision=''):Page<T>|undefined {
 const pages=caches.get(client)?.get(cacheTitle(client,provider,request,revision)),entry=pages?.get(stable(request));
 if(!entry?.resolved)return;
 const result=structuredClone(entry.resolved) as Page<T>,seen=new Set<string>();
 if(!request.cursor)while(result.next_cursor&&!seen.has(result.next_cursor)){seen.add(result.next_cursor);const next=pages?.get(stable({...request,cursor:result.next_cursor}));if(!next?.resolved||next.expires<=Date.now())break;result.items.push(...structuredClone(next.resolved.items) as T[]);result.next_cursor=next.resolved.next_cursor;}
 return result;
}
export async function sectionPage<T>(
  client: EngineClient,
  provider: string,
  request: Parameters<EngineClient["operation"]>[1],
  revision = "",
  options: { refresh?:boolean; onCached?:(page:Page<T>)=>void } = {},
): Promise<Page<T>> {
  let titles = caches.get(client);
  if (!titles) caches.set(client, (titles = new Map()));
  const title = cacheTitle(client,provider,request,revision);
  let pages = titles.get(title);
  if (!pages) {
    titles.set(title, (pages = new Map()));
    while (titles.size > MAX_TITLES) titles.delete(titles.keys().next().value!);
  }
  const key = stable(request);
  let entry = pages.get(key);
  if (!entry || entry.expires <= Date.now() || options.refresh) {
    const epoch=cacheGeneration,ttl=(request.operation==='releases'?5:15)*60_000;
    const value = (async()=>{
      const diskKey=await publicCacheKey(client,provider,'page',[sourceRevision(client,provider,revision),stable(request)],request.credential_profile);
      if(!options.refresh){
        const disk=await displayDisk.read<Page<unknown>>(diskKey);
        if(disk && disk.expires>Date.now()-24*60*60_000 && epoch===cacheGeneration && disk.value && Array.isArray(disk.value.items)){
          if(disk.expires>Date.now())return disk.value;
          options.onCached?.(structuredClone(disk.value) as Page<T>);
        }
      }
      const result=await client.operation<Page<unknown>>(provider,request);
      if(epoch===cacheGeneration)void displayDisk.write(diskKey,'metadata',result,JSON.stringify(result).length*2,Date.now()+ttl);
      return result;
    })();
    entry = {
      expires:
        Date.now() + (request.operation === "releases" ? 5 : 15) * 60_000,
      value,
      bytes: entry?.bytes??0,
      resolved: entry?.resolved,
    };
    const owned = entry;
    pages.set(key, entry);
    void value.then(
      (result) => {
        if(epoch!==cacheGeneration)return;
        owned.resolved = structuredClone(result);
        owned.value=Promise.resolve(owned.resolved);
        owned.expires=Date.now()+ttl;
        owned.bytes = JSON.stringify(result).length * 2;
        while (pages!.size > MAX_PAGES)
          pages!.delete(pages!.keys().next().value!);
        let bytes = 0;
        for (const group of titles!.values())
          for (const p of group.values()) bytes += p.bytes;
        while (bytes > MAX_BYTES && titles!.size) {
          const first = titles!.keys().next().value!;
          for (const p of titles!.get(first)!.values()) bytes -= p.bytes;
          titles!.delete(first);
        }
      },
      () => {
        if (pages!.get(key) === owned) {if(owned.resolved)pages!.set(key,{...owned,expires:0,value:Promise.resolve(owned.resolved)});else pages!.delete(key);}
      },
    );
  }
  const result = structuredClone(await entry.value) as Page<T>;
  // Restore contiguous pages already visited without fetching further pages.
  if (!request.cursor) {
    const seen = new Set<string>();
    while (result.next_cursor && !seen.has(result.next_cursor)) {
      seen.add(result.next_cursor);
      const next = pages.get(
        stable({ ...request, cursor: result.next_cursor }),
      );
      if (!next?.resolved || next.expires <= Date.now()) break;
      result.items.push(...(structuredClone(next.resolved.items) as T[]));
      result.next_cursor = next.resolved.next_cursor;
    }
  }
  return result;
}
