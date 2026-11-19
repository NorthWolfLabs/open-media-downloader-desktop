import {it,expect,vi} from 'vitest';
import {ResourceInvalidation} from './resourceInvalidation';
import {pageWindow} from './pageWindow';
it('refreshes during a continuous event stream and serializes slow refreshes',async()=>{
  vi.useFakeTimers();let active=0,maximum=0,calls=0;
  const queue=new ResourceInvalidation(async()=>{active++;maximum=Math.max(maximum,active);calls++;await new Promise(resolve=>setTimeout(resolve,500));active--;},()=>{});
  try{for(let n=0;n<30;n++){queue.add('jobs');await vi.advanceTimersByTimeAsync(100);}expect(calls).toBeGreaterThan(2);expect(maximum).toBe(1);queue.dispose();await vi.advanceTimersByTimeAsync(2000);const finished=calls;queue.add('jobs');await vi.advanceTimersByTimeAsync(2000);expect(calls).toBe(finished);}finally{queue.dispose();vi.useRealTimers();}
});
it('keeps loaded pages on refresh and rejects a broken cursor before looping',async()=>{
  const load=vi.fn(async(cursor:string|null)=>({items:Array.from({length:100},(_,i)=>Number(cursor??0)+i),next_cursor:Number(cursor??0)<200?String(Number(cursor??0)+100):null}));
  const page=await pageWindow(load,250);expect(page.items).toHaveLength(300);expect(load).toHaveBeenCalledTimes(3);expect(page.next_cursor).toBeNull();
  await expect(pageWindow(async()=>({items:[],next_cursor:'repeated'}),100)).rejects.toThrow('OMD received the same page twice. Refresh this list.');
});
