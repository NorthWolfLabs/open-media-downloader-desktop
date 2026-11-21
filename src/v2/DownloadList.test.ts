import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,within} from '@testing-library/svelte';
import {createRawSnippet} from 'svelte';
import DownloadList from './DownloadList.svelte';
afterEach(cleanup);
const job=(id:string,state:string,extra:Record<string,unknown>={})=>({id,state,title:`Item ${id}`,destination_id:'d1',bytes_done:0,bytes_total:0,issue:null,
 plan:{recipe:'mp3',collection:{title:'Show',reference:{provider:'p',id:'c'}},release:{reference:{provider:'p',id:id}}},...extra});
const group=(id:string,extra:Record<string,number>)=>({id,title:`Group ${id}`,created_at:'2026-11-10T09:00:00Z',total:1,completed:0,active:0,paused:0,failed:0,canceled:0,...extra});
const base=(extra:Record<string,unknown>)=>({jobs:[],groups:[],activeGroup:null,destinations:[{id:'d1',label:'Downloads',root:'/x',available:true}],jobCursor:null,groupCursor:null,
 onsearch:vi.fn(),ongroup:vi.fn(),onjobaction:vi.fn(),onformat:vi.fn(),ongroupaction:vi.fn(),onfiles:vi.fn(),onbrowse:vi.fn(),onmorejobs:vi.fn(),onmoregroups:vi.fn(),onbatch:vi.fn(),...extra});
it('marks failed downloads, retries them inline and lets paused or failed downloads be canceled',async()=>{
 const onjobaction=vi.fn();
 render(DownloadList,base({grouped:false,onjobaction,jobs:[job('a','failed',{issue:{code:'source_unavailable',message:'Source unavailable.',retryable:true,actions:['retry']}}),job('b','paused'),job('c','queued')]}));
 const failed=screen.getByRole('heading',{name:'Item a'}).closest('.record-row') as HTMLElement;
 expect(within(failed).getByText('failed').classList.contains('v2-error-text')).toBe(true);
 // The inline Retry sits on the row; the actions menu repeats it.
 const inline=within(failed).getAllByRole('button',{name:'Retry'}).find(b=>!b.closest('[popover]'))!;
 await fireEvent.click(inline);
 expect(onjobaction).toHaveBeenCalledWith(expect.objectContaining({id:'a'}),'retry');
 // One destination: rows don't repeat its name.
 expect(screen.queryByText(/Downloads ·/)).toBeNull();
 const paused=screen.getByRole('heading',{name:'Item b'}).closest('.record-row') as HTMLElement;
 expect(within(paused).queryAllByRole('button',{name:'Retry'}).filter(b=>!b.closest('[popover]'))).toHaveLength(0);
 await fireEvent.click(within(paused).getByRole('button',{name:'Actions for Item b'}));
 await fireEvent.click(within(paused).getByRole('button',{name:'Cancel download'}));
 expect(onjobaction).toHaveBeenCalledWith(expect.objectContaining({id:'b'}),'cancel');
});
it('shows only downloads needing attention when asked, until the user shows all',async()=>{
 render(DownloadList,base({attention:true,groups:[group('ok',{active:1}),group('bad',{failed:1})]}));
 expect(screen.queryByText('Group ok')).toBeNull();
 const bad=screen.getByText('Group bad').closest('.record-row') as HTMLElement;
 expect(within(bad).getByText('1 failed').classList.contains('v2-error-text')).toBe(true);
 await fireEvent.click(screen.getByRole('button',{name:'Show all downloads'}));
 expect(screen.getByText('Group ok')).toBeTruthy();
});
it('names the destination on each row only when there is more than one',()=>{
 render(DownloadList,base({grouped:false,jobs:[job('a','queued')],destinations:[{id:'d1',label:'Downloads',root:'/x',available:true},{id:'d2',label:'Travel drive',root:'/y',available:true}]}));
 expect(screen.getByText(/Downloads ·/)).toBeTruthy();
});
it('replaces the empty list with the shared plugin prerequisite when given one',()=>{
 const empty=createRawSnippet(()=>({render:()=>'<section aria-label="Add a source plugin">prerequisite</section>'}));
 render(DownloadList,base({empty}));
 expect(screen.getByRole('region',{name:'Add a source plugin'})).toBeTruthy();
 expect(screen.queryByText('Completed downloads are in History.')).toBeNull();
});
it('keeps the space after the collection title on ungrouped download rows',()=>{
 // Svelte drops whitespace at the end of an {#if} block; this once read "Show ·MP3".
 const {container}=render(DownloadList,base({grouped:false,jobs:[job('a','queued')]}));
 expect(container.querySelector('.download-copy p')!.textContent!.trim()).toMatch(/^Show · \S/);
});
it('offers another format instead of Retry when retrying would fail the same way',async()=>{
 const onjobaction=vi.fn(),onformat=vi.fn();
 const verification={code:'media_verification',message:'OMD could not verify the downloaded media file, so it was not saved. Trying again would give the same result; prepare it again and choose another format.',retryable:false,actions:['prepare_again']};
 render(DownloadList,base({grouped:false,onjobaction,onformat,jobs:[
  job('a','failed',{issue:verification}),
  job('b','failed',{issue:{code:'other',message:'Not retryable.',retryable:false,actions:[]}}),
  job('c','failed',{issue:{code:'media_verification',message:'The media container could not be verified.',retryable:true,actions:['retry']}}),
  job('d','failed'),
 ]}));
 const row=(id:string)=>screen.getByRole('heading',{name:`Item ${id}`}).closest('.record-row') as HTMLElement;
 const inline=(id:string,name:string)=>within(row(id)).queryAllByRole('button',{name}).filter(b=>!b.closest('[popover]'));
 // The engine's message renders as-is, and the row has no Retry.
 expect(within(row('a')).getByText(/prepare it again and choose another format\./)).toBeTruthy();
 expect(within(row('a')).queryAllByRole('button',{name:'Retry'})).toHaveLength(0);
 await fireEvent.click(inline('a','Choose another format')[0]);
 expect(onformat).toHaveBeenCalledWith(expect.objectContaining({id:'a'}));
 // The actions menu offers the same choice in place of Retry.
 await fireEvent.click(within(row('a')).getByRole('button',{name:'Actions for Item a'}));
 const menu=within(row('a')).getAllByRole('button',{name:'Choose another format'}).find(b=>b.closest('[popover]'))!;
 await fireEvent.click(menu);
 expect(onformat).toHaveBeenCalledTimes(2);
 // Any issue the engine marks not retryable gets the same action.
 expect(inline('b','Choose another format')).toHaveLength(1);
 expect(within(row('b')).queryAllByRole('button',{name:'Retry'})).toHaveLength(0);
 // Retryable issues, and failures without an issue, keep Retry.
 for(const id of ['c','d']){
  expect(inline(id,'Choose another format')).toHaveLength(0);
  await fireEvent.click(inline(id,'Retry')[0]);
  expect(onjobaction).toHaveBeenCalledWith(expect.objectContaining({id}),'retry');
 }
 expect(onjobaction).not.toHaveBeenCalledWith(expect.objectContaining({id:'a'}),'retry');
});
