import {it,expect} from 'vitest';
import {startupFailure} from './startup';
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
