import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/svelte';
import ImageOverview from './ImageOverview.svelte';
import type {Collection,EngineClient} from './client';
afterEach(cleanup);
it('keeps multi-image navigation, artist links and every tag in the existing overview',async()=>{
 const creator={reference:{provider:'p',id:'artist:2'},kind:'channel' as const,title:'Artist',canonical_url:'https://example.com/artist'};
 const collection={reference:{provider:'p',id:'1'},title:'Image',kind:'item',summary:{image:{count:2,release_id:'1',previews:['https://example.com/a','https://example.com/b']},creator_links:[{role:'Artist',collection:creator}],tags:Array.from({length:12},(_,i)=>'Tag '+i)}} as Collection;
 const oncollection=vi.fn(),ontagsearch=vi.fn();
 render(ImageOverview,{client:{artwork:()=>new Promise(()=>{})} as unknown as EngineClient,collection,info:null,oncollection,ontagsearch,gallery:true});
 expect(screen.getByText('Image 1 of 2')).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:'Next image'}));expect(screen.getByText('Image 2 of 2')).toBeTruthy();
 await fireEvent.click(screen.getByRole('button',{name:'Artist'}));expect(oncollection).toHaveBeenCalledWith({...creator,artwork_url:null,description:null});
 await fireEvent.click(screen.getByRole('button',{name:'Search tag Tag 11'}));expect(ontagsearch).toHaveBeenCalledWith('p','Tag 11');
 expect(screen.queryByRole('dialog')).toBeNull();
});
