import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {intentPrefetch,cancelIntentPrefetch} from './prefetch';
import {resetDisplayMemory} from './displayCache';
import type {EngineClient,ProviderManifest,Collection} from './client';
const source={id:'p',version:'1',media_tools:true,capabilities:['collection','releases']} as ProviderManifest;
const item=(id:string)=>({reference:{provider:'p',id},kind:'playlist',title:id,description:'A podcast',summary:{tags:['Podcast']}} as Collection);
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{cancelIntentPrefetch();resetDisplayMemory();vi.useRealTimers();vi.restoreAllMocks();});
it('cancels incidental pointer passes before requesting source data',async()=>{
 const operation=vi.fn();intentPrefetch({operation} as unknown as EngineClient,item('one'),source,null);await vi.advanceTimersByTimeAsync(119);cancelIntentPrefetch();await vi.advanceTimersByTimeAsync(1000);expect(operation).not.toHaveBeenCalled();
});
it('rapidly passing 100 collections only prefetches the last intended collection',async()=>{
 const operation=vi.fn(async()=>({items:[],next_cursor:null})),client={operation} as unknown as EngineClient;
 for(let n=0;n<100;n++)intentPrefetch(client,item(String(n)),source,null);
 await vi.advanceTimersByTimeAsync(120);expect(operation).toHaveBeenCalledOnce();expect(operation).toHaveBeenCalledWith('p',expect.objectContaining({operation:'releases',reference:{provider:'p',id:'99'},release_order:'desc'}));
});
it('caps active intent prefetches at two without queuing the rest',async()=>{
 const finish:((value:unknown)=>void)[]=[];const operation=vi.fn(()=>new Promise(resolve=>finish.push(resolve))),client={operation} as unknown as EngineClient;
 for(let n=0;n<3;n++){intentPrefetch(client,item(String(n)),source,null);await vi.advanceTimersByTimeAsync(120);}
 expect(operation).toHaveBeenCalledTimes(2);finish.forEach(resolve=>resolve({items:[],next_cursor:null}));await vi.advanceTimersByTimeAsync(0);
});
