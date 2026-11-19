import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import TagPicker from './TagPicker.svelte';
import type {EngineClient} from './client';
beforeEach(()=>{HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(cleanup);
it('finds tags using source suggestions and submits the source spelling',async()=>{
 const operation=vi.fn(async(_p,input)=>({tag_search:true,filters:[],feeds:[],sorts:[],tags:input.query?[{id:'blue_sky',label:'blue sky · 123 posts'}]:[{id:'landscape',label:'landscape'}]}));
 const onsearch=vi.fn(),onclose=vi.fn();render(TagPicker,{client:{operation} as unknown as EngineClient,sources:[{id:'p',name:'Source'}],accounts:{},onsearch,onclose});
 await screen.findByRole('button',{name:'Add landscape'});
 await fireEvent.input(screen.getByRole('searchbox',{name:'Tag name'}),{target:{value:'blue sk'}});
 await fireEvent.click(await screen.findByRole('button',{name:'Add blue sky'}));
 await fireEvent.click(screen.getByRole('button',{name:'Search tag'}));
 expect(onsearch).toHaveBeenCalledWith('p',['blue_sky']);expect(onclose).toHaveBeenCalledOnce();
});
it('ignores late suggestions after the query changes',async()=>{
 let resolveFirst:(value:unknown)=>void=()=>{};
 const operation=vi.fn(async(_p,input)=>input.query==='old'?new Promise(r=>resolveFirst=r):{tag_search:true,tags:input.query?[{id:'new',label:'New tag'}]:[],filters:[],feeds:[],sorts:[]});
 render(TagPicker,{client:{operation} as unknown as EngineClient,sources:[{id:'p',name:'Source'}],accounts:{},onsearch:vi.fn(),onclose:vi.fn()});
 await fireEvent.input(screen.getByRole('searchbox'),{target:{value:'old'}});
 await waitFor(()=>expect(operation).toHaveBeenCalledWith('p',expect.objectContaining({query:'old'})));
 await fireEvent.input(screen.getByRole('searchbox'),{target:{value:'new'}});
 await screen.findByRole('button',{name:'Add New tag'});
 resolveFirst({tag_search:true,tags:[{id:'old',label:'Old tag'}],filters:[],feeds:[],sorts:[]});
 await new Promise(r=>setTimeout(r,0));expect(screen.queryByText('Old tag')).toBeNull();expect(screen.getByRole('button',{name:'Add New tag'})).toBeTruthy();
});
