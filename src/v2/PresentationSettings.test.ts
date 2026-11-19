import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/svelte';
import PresentationSettings from './PresentationSettings.svelte';
import type {EngineClient} from './client';
const originals=Object.fromEntries(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name)]));
beforeEach(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});});
afterEach(()=>{cleanup();for(const [name,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(HTMLDialogElement.prototype,name,descriptor);else Reflect.deleteProperty(HTMLDialogElement.prototype,name);}});
it('distinguishes intentionally blank metadata from restoring source values',async()=>{
 const request=vi.fn(async(path:string,options?:any)=>path==='/v2/naming'?{collection:'{title}',release:'{title}'}:options?.method==='PUT'?options.body.overrides:{});
 const view=render(PresentationSettings,{client:{request} as unknown as EngineClient,visible:false});
 const reference={provider:'fixture',id:'chapter-1'};
 await view.component.edit('release',reference,{title:'Chapter 1',description:'Original description',chapter:'1'});
 await screen.findByRole('dialog',{name:'Release metadata'});
 expect(screen.queryByRole('checkbox')).toBeNull();
 await fireEvent.input(screen.getByRole('textbox',{name:'Custom description'}),{target:{value:''}});
 await fireEvent.click(screen.getByRole('button',{name:'Save metadata'}));
 await waitFor(()=>expect(request).toHaveBeenCalledWith('/v2/metadata/release',expect.objectContaining({body:{reference,overrides:{description:''}}})));
 await fireEvent.click(screen.getByRole('button',{name:'Use source value'}));
 expect((screen.getByRole('textbox',{name:'Custom description'}) as HTMLTextAreaElement).value).toBe('Original description');
 await fireEvent.click(screen.getByRole('button',{name:'Save metadata'}));
 await waitFor(()=>expect(request).toHaveBeenLastCalledWith('/v2/metadata/release',expect.objectContaining({body:{reference,overrides:{description:null}}})));
});
it('keeps the naming form open during retry and after a successful save',async()=>{
 let attempts=0;
 let resolveRetry!: (value: {collection:string;release:string})=>void;
 const request=vi.fn(async (_route:string, options?:any)=>{
  if(options?.method==='PUT') {
   attempts++;
   if(attempts===1) throw new Error('Temporary failure');
   return new Promise<{collection:string;release:string}>(resolve=>{resolveRetry=resolve;});
  }
  return {collection:'{title}',release:'{title}'};
 });
 const {container}=render(PresentationSettings,{client:{request} as unknown as EngineClient,visible:true});
 await waitFor(()=>expect(request).toHaveBeenCalled());
 const details=container.querySelector('details')!;
 details.open=true;
 await fireEvent(details,new Event('toggle'));
 await fireEvent.click(screen.getByRole('button',{name:'Save naming'}));
 await screen.findByText('Temporary failure');
 expect(details.open).toBe(true);
 await fireEvent.click(screen.getByRole('button',{name:'Save naming'}));
 await waitFor(()=>expect(attempts).toBe(2));
 expect(details.open).toBe(true);
 resolveRetry({collection:'{title}',release:'{title}'});
 await screen.findByText('Naming templates saved.');
 expect(details.open).toBe(true);
});
