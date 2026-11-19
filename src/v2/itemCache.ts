import type { Collection, CollectionDetails, EngineClient } from "./client";
import {displayDisk} from './diskCache';
import {publicCacheKey,sourceRevision,registerCacheReset,cacheGeneration} from './displayCache';
registerCacheReset(()=>{clients=new WeakMap();});
// Main-item requests share a short-lived, account-scoped cache. Nested sections
// are deliberately excluded. Failed requests are evicted so explicit retry works.
let clients = new WeakMap<
  EngineClient,
  Map<string, { expires: number; value: Promise<unknown>; resolved?: unknown; bytes:number }>
>();
export function clearItemCache(client: EngineClient) {
  clients.delete(client);
}
export function itemMetadata<T>(
  client: EngineClient,
  collection: Collection,
  operation: "collection" | "details",
  account: string | null = null,
  refresh=false,
): Promise<T> {
  let cache = clients.get(client);
  if (!cache) clients.set(client, (cache = new Map()));
  const key = JSON.stringify([
    sourceRevision(client,collection.reference.provider),
    collection.reference.provider,
    collection.reference.id,
    operation,
    account,
  ]);
  const cached = cache.get(key);
  if (!refresh && cached && cached.expires > Date.now()) return cached.value as Promise<T>;
  const epoch=cacheGeneration;
  const value = (async()=>{
    const diskKey=await publicCacheKey(client,collection.reference.provider,'item',[operation,collection.reference],account);
    const disk=refresh?undefined:await displayDisk.read<T>(diskKey);
    if(disk && disk.expires>Date.now())return disk.value;
    const result=await client.operation<T>(collection.reference.provider,{operation,reference:collection.reference,credential_profile:account});
    if(epoch===cacheGeneration)void displayDisk.write(diskKey,'metadata',result,JSON.stringify(result).length*2,Date.now()+30*60_000);
    return result;
  })();
  const entry: {
    expires: number;
    value: Promise<unknown>;
    resolved?: unknown;
    bytes:number;
  } = { bytes:0, expires: Date.now() + 30 * 60 * 1000, value };
  void value.then(
    (result) => {
      if(epoch!==cacheGeneration)return;
      entry.resolved = result;
      entry.bytes=JSON.stringify(result).length*2;
      let bytes=[...cache!.values()].reduce((n,e)=>n+e.bytes,0);
      while(bytes>8*1024*1024&&cache!.size){const oldest=cache!.keys().next().value!;bytes-=cache!.get(oldest)!.bytes;cache!.delete(oldest);}
      entry.expires = Date.now() + 30 * 60 * 1000;
    },
    () => {},
  );
  cache.set(key, entry);
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  void value.catch(() => {
    if (cache!.get(key) === entry) cache!.delete(key);
  });
  return value;
}
export async function mainItem(
  client: EngineClient,
  collection: Collection,
  details: boolean,
  account: string | null = null,
  refresh = false,
) {
  const [fresh, info] = await Promise.allSettled([
    // A catalog summary can contain only a rating. Fetch the main item when
    // opening a sparse result so its full cover and metadata remain available.
    !refresh && collection.kind !== "item" && collection.summary && collection.description
      ? Promise.resolve(collection)
      : itemMetadata<Collection>(client, collection, "collection", account,refresh),
    details
      ? itemMetadata<CollectionDetails>(client, collection, "details", account,refresh)
      : Promise.resolve(null),
  ]);
  return {
    collection: enrichCollection(
      fresh.status === "fulfilled" ? fresh.value : collection,
      info.status === "fulfilled" ? info.value : null,
    ),
    info: info.status === "fulfilled" ? info.value : null,
  };
}

export function cachedItemMetadata<T>(
  client: EngineClient,
  collection: Collection,
  operation: "collection" | "details",
  account: string | null = null,
): T | undefined {
  const cached = clients
    .get(client)
    ?.get(
      JSON.stringify([
        sourceRevision(client,collection.reference.provider),
        collection.reference.provider,
        collection.reference.id,
        operation,
        account,
      ]),
    );
  return cached && cached.expires > Date.now()
    ? (cached.resolved as T | undefined)
    : undefined;
}

/** Apply source-neutral detail fields without guessing semantics from fact labels. */
function enrichCollection(
  collection: Collection,
  info: CollectionDetails | null,
): Collection {
  if (!info) return collection;
  return {
    ...collection,
    description: info.description ?? collection.description,
    summary: {
      ...collection.summary,
      ...(info.tags.length
        ? {
            tags: info.tags.map((tag) => tag.label),
            tag_appearances: {
              ...collection.summary?.tag_appearances,
              ...Object.fromEntries(
                info.tags
                  .filter((tag) => tag.appearance)
                  .map((tag) => [tag.label, tag.appearance!]),
              ),
            },
          }
        : {}),
      ...(info.creators.length
        ? {
            creators: [
              ...new Set(info.creators.flatMap((field) => field.values)),
            ],
          }
        : {}),
      ...(info.languages.length ? { languages: info.languages } : {}),
    },
  };
}
