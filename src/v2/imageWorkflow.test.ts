import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/svelte';
import Discovery from './DiscoveryHarness.svelte';
import {discoveryState} from './discoveryState';
import type {Collection,EngineClient,ProviderManifest} from './client';
const originals=Object.fromEntries(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name)]));
beforeEach(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterEach(()=>{cleanup();localStorage.clear();for(const [name,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,name,descriptor);else Reflect.deleteProperty(HTMLDialogElement.prototype,name);}});
const items:Collection[]=[1,2].map(n=>({reference:{provider:'images',id:String(n)},kind:'item',title:`Image post ${n}`,canonical_url:`https://example.com/${n}`,summary:{image:{release_id:String(n),count:n===1?3:1,width:1200,height:900}}}));
function setup(onimagedownload=vi.fn(async()=>{})){
 const state=discoveryState();Object.assign(state,{selected:['images'],searched:true,editing:false,results:items,layout:'compact'});
 const oncollection=vi.fn();
 render(Discovery,{state,client:{operation:vi.fn(async(_p,input)=>input.operation==='collection'?items.find(i=>i.reference.id===input.reference.id):{items:[],next_cursor:null})} as unknown as EngineClient,sources:[{manifest:{id:'images',name:'Images',api:'omd:provider@2.0.0',version:'1',description:'',source_hosts:['example.com'],capabilities:['search','browse'],grants:[]} as ProviderManifest}],accounts:{},languages:'',oncollection,onlink:vi.fn(),onsources:vi.fn(),onimagedownload,destinations:[{id:'folder',label:'My images',root:'/tmp/images',available:true}]});
 return {oncollection,onimagedownload};
}
it('opens full details directly and checks the whole selected batch once',async()=>{
 const {oncollection,onimagedownload}=setup();
 await fireEvent.click(screen.getByRole('checkbox',{name:'Select Image post 1'}));
 await fireEvent.click(screen.getByRole('button',{name:'Image post 1'}));
 expect(oncollection).toHaveBeenCalledWith(items[0]);
 expect(screen.queryByRole('dialog')).toBeNull();
 await fireEvent.click(screen.getByRole('checkbox',{name:'Select Image post 2'}));
 await fireEvent.click(screen.getByRole('button',{name:'Download selected'}));
 await screen.findByText('4 images · Original quality');
 await fireEvent.click(screen.getByRole('button',{name:'Check downloads'}));
 await waitFor(()=>expect(onimagedownload).toHaveBeenCalledOnce());
 expect(onimagedownload.mock.calls[0]).toEqual([items,'folder']);
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect((screen.getByRole('checkbox',{name:'Select Image post 1'}) as HTMLInputElement).checked).toBe(false);
});
it('keeps the batch selected if preparation fails',async()=>{
 setup(vi.fn(async()=>{throw new Error('Destination disconnected');}));
 await fireEvent.click(screen.getByRole('button',{name:'Select loaded'}));
 await fireEvent.click(screen.getByRole('button',{name:'Download selected'}));
 await fireEvent.click(screen.getByRole('button',{name:'Check downloads'}));
 await screen.findByText('Destination disconnected');
 await fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));
 expect((screen.getByRole('checkbox',{name:'Select Image post 1'}) as HTMLInputElement).checked).toBe(true);
});
