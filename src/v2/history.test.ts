import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/svelte';
import {historyGroups} from './history';
import {itemMetadata} from './itemCache';
import RemovalDialog from './RemovalDialog.svelte';
import Toast from './ui/Toast.svelte';
import type {Collection,EngineClient,Job} from './client';
afterEach(()=>{cleanup();vi.useRealTimers();});
const job=(id:string,provider='source',collection='series')=>({id,title:`Chapter ${id}`,updated_at:'2026-09-07',plan:{collection:{title:'Same title',reference:{provider,id:collection}},release:{reference:{provider,id},canonical_url:'https://example.org/chapter'}}} as Job);
function dialogs(){Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});}
it('groups history across separate download batches without merging source identities',()=>{const groups=historyGroups([job('1'),job('2'),job('3','another'),job('4','source','different')]);expect(groups.map(g=>g.jobs.length)).toEqual([2,1,1]);});
it('shares in-flight metadata only within the same account and retries failures',async()=>{const operation=vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({title:'Fresh'});const client={operation} as unknown as EngineClient;const collection={reference:{provider:'source',id:'1'}} as Collection;const a=itemMetadata(client,collection,'details','account-a');expect(itemMetadata(client,collection,'details','account-a')).toBe(a);await expect(a).rejects.toThrow('Offline');await itemMetadata(client,collection,'details','account-a');await itemMetadata(client,collection,'details','account-b');expect(operation).toHaveBeenCalledTimes(3);expect(operation.mock.calls.every(([,input])=>input.operation==='details')).toBe(true);});
it('requires one explicit confirmation for batch removal and retries only the failed item',async()=>{dialogs();let failed=true;const request=vi.fn(async(route:string)=>{if(route==='/v2/jobs/2/file-operations'&&failed){failed=false;throw new Error('Destination disconnected');}if(route.includes('/jobs/'))return{id:route.includes('/1/')?'op1':'op2',state:'ready'};return{id:route.includes('op1')?'op1':'op2',state:'complete'};});render(RemovalDialog,{client:{request} as unknown as EngineClient,jobs:[job('1'),job('2')],mode:'forget_history',onclose:vi.fn(),onchanged:vi.fn()});expect(request).not.toHaveBeenCalled();await fireEvent.click(screen.getByRole('button',{name:'Remove history'}));await screen.findByRole('button',{name:'Retry failed items'});await fireEvent.click(screen.getByRole('button',{name:'Retry failed items'}));await screen.findByText('2 of 2 complete');expect(request.mock.calls.filter(([route])=>route==='/v2/file-operations/op1/start')).toHaveLength(1);expect(request.mock.calls.filter(([route])=>route==='/v2/file-operations/op2/start')).toHaveLength(1);});
it('dismisses download notifications after five seconds and pauses while hovered',async()=>{vi.useFakeTimers();const close=vi.fn();render(Toast,{message:'Download added',onclose:close});await fireEvent.mouseEnter(screen.getByRole('status'));await vi.advanceTimersByTimeAsync(6000);expect(close).not.toHaveBeenCalled();await fireEvent.mouseLeave(screen.getByRole('status'));await vi.advanceTimersByTimeAsync(5000);expect(close).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'View downloads'})).toBeNull();});

it('selects the entire collection for one removal action, including more than one API page',async()=>{
 Object.defineProperty(HTMLElement.prototype,'showPopover',{configurable:true,value:function(){}});Object.defineProperty(HTMLElement.prototype,'hidePopover',{configurable:true,value:function(){}});
 const {default:History}=await import('./History.svelte');const onremove=vi.fn();
 render(History,{client:{listAll:vi.fn().mockResolvedValue(Array.from({length:205},(_,i)=>job(String(i))))} as unknown as EngineClient,revision:0,sources:{source:'Source'},onfiles:vi.fn(),onfocus:vi.fn(),onremove});
 await fireEvent.click(await screen.findByRole('button',{name:/Same title 205 downloads/}));
 await fireEvent.click(screen.getByRole('button',{name:'Select items'}));
 await fireEvent.click(screen.getByRole('checkbox',{name:'Select all'}));
 await fireEvent.click(screen.getByRole('button',{name:'Manage selected items'}));
 await fireEvent.click(screen.getByRole('button',{name:'Remove history'}));
 expect(onremove).toHaveBeenCalledOnce();expect(onremove.mock.calls[0][0]).toHaveLength(205);expect(onremove.mock.calls[0][1]).toBe('forget_history');
});

it('keeps actionable completion and error notifications until acknowledged',async()=>{vi.useFakeTimers();const close=vi.fn(),action=vi.fn();render(Toast,{message:'Download check failed',kind:'error',actionLabel:'View issue',action,onclose:close});await vi.advanceTimersByTimeAsync(60000);expect(close).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toBeTruthy();await fireEvent.click(screen.getByRole('button',{name:'View issue'}));expect(action).toHaveBeenCalledOnce();});
