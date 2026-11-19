import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,waitFor,fireEvent} from '@testing-library/svelte';
import Artwork from './Artwork.svelte';
import {loadArtwork,cachedArtwork} from './artworkCache';
import type {EngineClient} from './client';
beforeEach(()=>{let n=0;vi.stubGlobal('Image',class{src='';naturalWidth=400;naturalHeight=800;decode=async()=>{}});vi.stubGlobal('IntersectionObserver',undefined);URL.createObjectURL=vi.fn(()=>`blob:${++n}`);URL.revokeObjectURL=vi.fn();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('evicts cached bytes without revoking a mounted image, and reloads evicted entries',async()=>{
 const client={artwork:vi.fn(async()=>new Blob(['image'],{type:'image/png'}))} as unknown as EngineClient;
 const view=render(Artwork,{client,provider:'p',url:'https://example.com/first',label:'First'});
 await waitFor(()=>expect(view.container.querySelector('img')).not.toBeNull());
 const displayed=view.container.querySelector('img')!.src;
 for(let n=0;n<125;n++)await loadArtwork(client,'p',`https://example.com/${n}`);
 expect(cachedArtwork(client,'p','https://example.com/first')).toBeUndefined();
 expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(displayed);
 expect(view.container.querySelector('img')!.src).toBe(displayed);
 await loadArtwork(client,'p','https://example.com/first');
 expect(client.artwork).toHaveBeenCalledTimes(127);
 view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledWith(displayed);
});
it('recovers a failed thumbnail when the app regains focus',async()=>{
 const artwork=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Blob(['image'],{type:'image/png'}));
 const view=render(Artwork,{client:{artwork} as unknown as EngineClient,provider:'p',url:'https://example.com/image',label:'Recover'});
 await screen.findByTitle('Artwork unavailable');
 window.dispatchEvent(new Event('focus'));
 await waitFor(()=>expect(view.container.querySelector('img')).not.toBeNull());
 expect(artwork).toHaveBeenCalledTimes(2);
});
it('coalesces concurrent artwork loads and does not cache rejection',async()=>{
 const artwork=vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(new Blob(['image'],{type:'image/png'}));
 const client={artwork} as unknown as EngineClient;
 await expect(Promise.all([loadArtwork(client,'p','u'),loadArtwork(client,'p','u')])).rejects.toThrow('temporary');
 await loadArtwork(client,'p','u');expect(artwork).toHaveBeenCalledTimes(2);
});

it('retries when the browser rejects a previously decoded image',async()=>{
 const artwork=vi.fn(async()=>new Blob(['image'],{type:'image/png'}));
 const view=render(Artwork,{client:{artwork} as unknown as EngineClient,provider:'p',url:'https://example.com/rejected',label:'Rejected'});
 await waitFor(()=>expect(view.container.querySelector('img')).not.toBeNull());
 await fireEvent.error(view.container.querySelector('img')!);
 await waitFor(()=>expect(artwork).toHaveBeenCalledTimes(2),{timeout:2000});
 await waitFor(()=>expect(view.container.querySelector('img')).not.toBeNull());
});

it('keeps a readable avatar fallback instead of clipping an error sentence into a circle',async()=>{
 const artwork=vi.fn().mockRejectedValue(new Error('temporarily unavailable'));
 const view=render(Artwork,{client:{artwork} as unknown as EngineClient,provider:'p',url:'https://example.com/avatar',label:'Artist name',avatar:true});
 await waitFor(()=>expect(view.container.querySelector('.artwork')?.getAttribute('title')).toBe('Artist name: image unavailable'));
 expect(view.container.querySelector('.initials')?.textContent).toBe('Ar');
 expect(view.container.querySelector('.unavailable')).toBeNull();
});

it('continues recovery after an outage longer than the original seven-second retry window',async()=>{
 vi.useFakeTimers();
 try {
  const artwork=vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Blob(['image'],{type:'image/png'}));
  const view=render(Artwork,{client:{artwork} as unknown as EngineClient,provider:'p',url:'https://example.com/long-outage',label:'Recovery'});
  await vi.advanceTimersByTimeAsync(16000);
  expect(artwork).toHaveBeenCalledTimes(5);
  expect(view.container.querySelector('img')).not.toBeNull();
 } finally {vi.useRealTimers();}
});
