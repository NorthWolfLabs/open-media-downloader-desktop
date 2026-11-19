import type { EngineClient, ProviderManifest } from './client';

// Cache authority follows the installed package digest, never just its name or
// version. Authenticated sources remain memory-only; no credential is persisted.
type Source = { manifest: ProviderManifest; digest?: string };
const sources = new WeakMap<EngineClient, Map<string, Source>>();
const accounts=new WeakMap<EngineClient,Record<string,string|null>>();
function changed(client:EngineClient|null){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("omd-display-scope",{detail:client}));}
export function configureDisplayAccounts(client:EngineClient,value:Record<string,string|null>){const previous=accounts.get(client);accounts.set(client,value);if(previous&&JSON.stringify(previous)!==JSON.stringify(value))changed(client);}
const resets = new Set<() => void>();
export let cacheGeneration = 0;
export function registerCacheReset(reset: () => void) { resets.add(reset); }
export function resetDisplayMemory() { cacheGeneration++; for (const reset of resets) reset(); changed(null); }
export function configureDisplaySources(client: EngineClient, installed: Source[]) {
  sources.set(client, new Map(installed.map(s => [s.manifest.id, s])));
}
export function sourceRevision(client: EngineClient, provider: string, fallback = '') {
  const source=sources.get(client)?.get(provider);
  return (source?.digest ?? source?.manifest.version ?? fallback)+":"+(accounts.get(client)?.[provider]??"");
}
export async function publicCacheKey(client: EngineClient, provider: string, kind: string, value: unknown, account?: string|null) {
  const source=sources.get(client)?.get(provider);
  if(account || accounts.get(client)?.[provider] || !source?.digest || source.manifest.grants.some(g=>g.credential) || !globalThis.crypto?.subtle) return null;
  const data=new TextEncoder().encode(JSON.stringify([source.manifest.id,source.digest,kind,value]));
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('');
}
export function stable(value: unknown): string {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
  return JSON.stringify(value)??'null';
}
