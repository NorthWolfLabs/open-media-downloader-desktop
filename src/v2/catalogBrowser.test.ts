import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import CatalogBrowser from './CatalogBrowser.svelte';
import Artwork from './Artwork.svelte';
import OutputOptions from './OutputOptions.svelte';
import type { EngineClient, ProviderManifest, Collection } from './client';
afterEach(cleanup);
const source=(id:string)=>({manifest:{id,name:`Source ${id}`,version:'1',api:'omd:provider@2.0.0',description:'Fixture',source_hosts:['example.org'],capabilities:['browse'],grants:[]} as ProviderManifest});
const item=(id:string):Collection=>({reference:{provider:'1',id},kind:'playlist',title:`Podcast ${id}`,description:null,canonical_url:"https://example.org/show",artwork_url:null,summary:{tags:['Podcast']}});
const props=(operation:any)=>({client:{operation} as EngineClient,sources:[source('1')],selected:'1',onselect:vi.fn(),oncollection:vi.fn(),onsearch:vi.fn(),onfeed:vi.fn(),accounts:{},languages:'en'});
it('opens real content directly with one source and no redundant source directory',async()=>{
 const operation=vi.fn(async()=>({items:[item('show')],next_cursor:null}));const p=props(operation);render(CatalogBrowser,p);
 await fireEvent.click(await screen.findByRole('button',{name:/Podcast show/}));
 expect(p.oncollection).toHaveBeenCalledWith(item('show'));expect(screen.queryByRole('navigation',{name:'Source catalogs'})).toBeNull();
 expect(operation).toHaveBeenCalledTimes(1);
});
it('filters 100 source names locally, requests only the selected source, and ignores stale replies',async()=>{
 let resolve!:(p:unknown)=>void;
 const operation=vi.fn(async(id:string)=>id==='1'?new Promise(r=>resolve=r):({items:[item(id)],next_cursor:null}));
 const p={...props(operation),sources:Array.from({length:100},(_,i)=>source(String(i+1)))};const view=render(CatalogBrowser,p);
 await waitFor(()=>expect(operation).toHaveBeenCalledTimes(1));
 await fireEvent.input(screen.getByRole('searchbox',{name:'Find a source'}),{target:{value:'Source 100'}});
 expect(screen.getByRole('navigation',{name:'Source catalogs'}).querySelectorAll('button')).toHaveLength(1);
 expect(operation).toHaveBeenCalledTimes(1);
 await fireEvent.click(screen.getByRole('button',{name:'Source 100'}));expect(p.onselect).toHaveBeenCalledWith('100');
 await view.rerender({...p,selected:'100'});await screen.findByText('Podcast 100');resolve({items:[item('stale')],next_cursor:null});
 await waitFor(()=>expect(screen.queryByText('Podcast stale')).toBeNull());expect(operation.mock.calls.map(c=>c[0])).toEqual(['1','100']);
});
it('loads another bounded catalog page explicitly and preserves previous items',async()=>{
 const operation=vi.fn(async(_id:string,input:any)=>({items:[item(input.cursor?'second':'first')],next_cursor:input.cursor?null:'next'}));render(CatalogBrowser,props(operation));
 await fireEvent.click(await screen.findByRole('button',{name:'Load more'}));await screen.findByText('Podcast second');expect(screen.getByText('Podcast first')).toBeTruthy();
 expect(operation.mock.calls[1][1]).toMatchObject({cursor:'next',page_size:48});
});
it('uses an audio symbol rather than a title initial when podcast artwork is missing',()=>{
 const {container}=render(Artwork,{client:null,provider:'1',label:'Houston',kind:'audio',url:null});
 expect(container.querySelector('.media-placeholder.audio svg')).toBeTruthy();expect(container.textContent).not.toContain('H');
});

it('offers audio formats without subtitle or video resolution controls',async()=>{
 render(OutputOptions,{audio:true,media:true,recipe:'mp3',maxHeight:1080,subtitles:'',automaticSubtitles:false});
 expect(screen.queryByText('Subtitles')).toBeNull();expect(screen.queryByText('Resolution')).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'Save as: MP3 audio'}));expect(screen.getByRole('button',{name:'Opus audio'})).toBeTruthy();expect(screen.queryByRole('button',{name:'MP4 video'})).toBeNull();
});

it('restores a visited catalog synchronously after returning without requesting it again',async()=>{
 const operation=vi.fn(async()=>({items:[item('cached')],next_cursor:null})),p=props(operation);
 const first=render(CatalogBrowser,p);await screen.findByText('Podcast cached');first.unmount();
 render(CatalogBrowser,p);expect(screen.getByText('Podcast cached')).toBeTruthy();await Promise.resolve();expect(operation).toHaveBeenCalledTimes(1);expect(screen.queryByText('Loading catalog…')).toBeNull();
});
it('explicit refresh keeps old content visible then replaces it with current membership',async()=>{
 let resolve!:(v:unknown)=>void;const operation=vi.fn().mockResolvedValueOnce({items:[item('old')],next_cursor:null}).mockImplementationOnce(()=>new Promise(r=>resolve=r));
 render(CatalogBrowser,props(operation));await screen.findByText('Podcast old');await fireEvent.click(screen.getByRole('button',{name:'Refresh catalog'}));expect(screen.getByText('Podcast old')).toBeTruthy();
 await waitFor(()=>expect(operation).toHaveBeenCalledTimes(2));resolve({items:[item('new')],next_cursor:null});await screen.findByText('Podcast new');expect(screen.queryByText('Podcast old')).toBeNull();
});
it('keeps the spaces around the episode count on a podcast card',async()=>{
 // Svelte drops whitespace at the start of an {#if} block; this once read "Podcast· 447 episodes".
 const show={...item('show'),summary:{tags:['Podcast'],video_count_label:'447 episodes'}};
 render(CatalogBrowser,props(vi.fn(async()=>({items:[show],next_cursor:null}))));
 await screen.findByText('Podcast show');
 expect(document.querySelector('.catalog-facts')!.textContent).toBe('Podcast · 447 episodes');
});
