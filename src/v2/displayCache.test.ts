import {afterEach,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {configureDisplaySources,configureDisplayAccounts,publicCacheKey,resetDisplayMemory} from './displayCache';
import {sectionPage,cachedSectionPage} from './sectionCache';
import {loadArtwork} from './artworkCache';
import type {EngineClient,ProviderManifest} from './client';
afterEach(()=>{resetDisplayMemory();vi.unstubAllGlobals();vi.restoreAllMocks();});
const manifest={id:'p',name:'Public',version:'1',grants:[]} as unknown as ProviderManifest;
it('partitions disk keys by exact source digest and never persists authenticated data',async()=>{
 vi.stubGlobal('crypto',webcrypto);const client={} as EngineClient;
 configureDisplaySources(client,[{manifest,digest:'a'.repeat(64)}]);const first=await publicCacheKey(client,'p','page','query');expect(first).toHaveLength(64);
 configureDisplaySources(client,[{manifest,digest:'b'.repeat(64)}]);expect(await publicCacheKey(client,'p','page','query')).not.toBe(first);
 expect(await publicCacheKey(client,'p','page','query','account')).toBeNull();configureDisplayAccounts(client,{p:'account'});expect(await publicCacheKey(client,'p','artwork','url')).toBeNull();
 configureDisplayAccounts(client,{});configureDisplaySources(client,[{manifest:{...manifest,grants:[{id:'private',hosts:['example.org'],methods:['GET'],credential:true}]},digest:'a'.repeat(64)}]);expect(await publicCacheKey(client,'p','page','query')).toBeNull();
});
it('does not repopulate memory when a pending read finishes after clearing the cache',async()=>{
 let finish!:(v:unknown)=>void;const operation=vi.fn(()=>new Promise(r=>finish=r));const client={operation} as unknown as EngineClient;const request={operation:'browse',query:''};
 const pending=sectionPage(client,'p',request);await vi.waitFor(()=>expect(operation).toHaveBeenCalledOnce());resetDisplayMemory();finish({items:['old'],next_cursor:null});await pending;expect(cachedSectionPage(client,'p',request)).toBeUndefined();
});
it('coalesces concurrent original and thumbnail transfers while separating their cache entries',async()=>{
 vi.stubGlobal('Image',class{src='';naturalWidth=128;naturalHeight=128;decode=async()=>{}});URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn();
 const blob=new Blob(['original'],{type:'image/jpeg'}),artwork=vi.fn(async()=>blob),client={artwork} as unknown as EngineClient;
 const [thumb,original]=await Promise.all([loadArtwork(client,'p','url'),loadArtwork(client,'p','url','original')]);expect(artwork).toHaveBeenCalledOnce();expect(original.blob).toBe(blob);expect(thumb.ratio).toBe(1);
});
