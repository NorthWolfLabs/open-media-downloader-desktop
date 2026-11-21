import {it,expect} from 'vitest';
import {startupFailure,startWhileEngineStops,engineStopping} from './startup';
import {EngineError} from './client';
it('reads the native flags: a newer OMD and a damaged install cannot be retried',()=>{
 expect(startupFailure({message:'A newer version of OMD is using your data. Install the newer OMD; going back to an older version is not supported.',retryable:false,newer_version:true,log:false}))
  .toEqual({summary:'A newer version of OMD is using your data. Install the newer OMD; going back to an older version is not supported.',detail:'',retryable:false,newerVersion:true,log:false});
 const damaged=startupFailure({message:'OMD is damaged or incomplete. Reinstall OMD.',retryable:false,newer_version:false,log:false});
 expect(damaged.retryable).toBe(false);expect(damaged.newerVersion).toBe(false);
});
it('splits people-facing text from diagnostics and keeps the log flag',()=>{
 const failure=startupFailure({message:'OMD did not finish starting within three minutes.\nDisk and tool verification errors are recorded in /x/engine.log',retryable:true,newer_version:false,log:true});
 expect(failure.summary).toBe('OMD did not finish starting within three minutes.');
 expect(failure.detail).toBe('Disk and tool verification errors are recorded in /x/engine.log');
 expect(failure.retryable).toBe(true);expect(failure.log).toBe(true);
});
it('treats plain text and errors from elsewhere as retryable',()=>{
 expect(startupFailure('No saved connection.')).toMatchObject({summary:'No saved connection.',retryable:true,newerVersion:false,log:false});
 expect(startupFailure(new Error('lost'))).toMatchObject({summary:'lost',retryable:true});
 expect(startupFailure(undefined).summary).toBe('OMD could not start.');
});
it('waits and starts again while the engine is stopping (503 engine_stopping), then attaches',async()=>{
 const stopping=new EngineError({code:'engine_stopping',message:'OMD is stopping.',retryable:true,actions:['retry']} as any,503);
 const waits:number[]=[];let calls=0;
 const result=await startWhileEngineStops(async()=>{calls++;if(calls<3)throw stopping;return 'attached';},async ms=>{waits.push(ms);});
 expect(result).toBe('attached');expect(calls).toBe(3);expect(waits).toEqual([500,1000]);
 expect(engineStopping(stopping)).toBe(true);
});
it('does not retry other failures, and gives up on a stopping engine after the last attempt',async()=>{
 const other=new EngineError({code:'unauthorized',message:'No.',retryable:false,actions:[]} as any,401);
 let calls=0;
 await expect(startWhileEngineStops(async()=>{calls++;throw other;},async()=>{})).rejects.toBe(other);
 expect(calls).toBe(1);expect(engineStopping(other)).toBe(false);
 expect(engineStopping(new EngineError({code:'engine_stopping',message:'x',retryable:true,actions:[]} as any,500))).toBe(false);
 expect(engineStopping('engine_stopping')).toBe(false);
 const stopping=new EngineError({code:'engine_stopping',message:'OMD is stopping.',retryable:true,actions:[]} as any,503);
 calls=0;const waits:number[]=[];
 await expect(startWhileEngineStops(async()=>{calls++;throw stopping;},async ms=>{waits.push(ms);},4)).rejects.toBe(stopping);
 expect(calls).toBe(4);expect(waits).toEqual([500,1000,1500]);
});
