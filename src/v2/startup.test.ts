import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/svelte';
const native=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:native.invoke}));
import App from './App.svelte';
afterEach(()=>{cleanup();Reflect.deleteProperty(window,'__TAURI_INTERNALS__');native.invoke.mockReset();});
it('shows startup work, a plain native error and its diagnostics only under Technical details, with an explicit retry',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});
 let fail!:(reason:unknown)=>void;
 native.invoke.mockImplementation((name:string)=>new Promise((_,reject)=>{if(name==='v2_bootstrap_engine')fail=reject;}));
 const boots=()=>native.invoke.mock.calls.filter(([name])=>name==='v2_bootstrap_engine').length;
 render(App);
 await screen.findByRole('heading',{name:'Opening OMD'});
 expect(screen.getByRole('progressbar',{name:'Opening OMD'})).toBeTruthy();
 expect(screen.queryByLabelText('Client token')).toBeNull();
 fail('OMD did not finish starting within three minutes. Restart your computer, then open OMD again.\nDisk and tool verification errors are recorded in /disposable/profile/engine.log');
 await screen.findByRole('heading',{name:'OMD couldn’t start'});
 const alert=screen.getByRole('alert');
 expect(alert.textContent).toBe('OMD did not finish starting within three minutes. Restart your computer, then open OMD again.');
 const details=screen.getByText('Technical details').closest('details')!;
 expect(details.open).toBe(false);
 expect(details.querySelector('.connection-detail')?.textContent).toBe('Disk and tool verification errors are recorded in /disposable/profile/engine.log');
 await fireEvent.click(screen.getByText('Try again'));
 await waitFor(()=>expect(boots()).toBe(2));
 expect(screen.getByRole('heading',{name:'Opening OMD'})).toBeTruthy();
});
it('never shows the developer connection form in the native app, and offers diagnostics actions',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});
 const writeText=vi.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
 native.invoke.mockImplementation(async(name:string)=>{
  if(name==='v2_bootstrap_engine')throw {message:'OMD did not finish starting within three minutes. Restart your computer, then open OMD again.\nDisk and tool verification errors are recorded in /disposable/profile/engine.log',retryable:true,newer_version:false,log:true};
  return undefined;
 });
 render(App);
 await screen.findByRole('heading',{name:'OMD couldn’t start'});
 expect(screen.queryByLabelText('Engine address')).toBeNull();
 expect(screen.queryByLabelText('Client token')).toBeNull();
 expect(screen.queryByRole('button',{name:'Connect'})).toBeNull();
 expect(screen.queryByText(/session/)).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'Copy details'}));
 expect(writeText).toHaveBeenCalledWith('OMD did not finish starting within three minutes. Restart your computer, then open OMD again.\nDisk and tool verification errors are recorded in /disposable/profile/engine.log');
 await fireEvent.click(screen.getByRole('button',{name:'Show log file'}));
 expect(native.invoke).toHaveBeenCalledWith('v2_reveal_engine_log');
 expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();
});
it('hides Try again when retrying cannot help, and offers the latest OMD for a newer version',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});
 native.invoke.mockImplementation(async(name:string)=>{
  if(name==='v2_bootstrap_engine')throw {message:'A newer version of OMD is using your data. Install the newer OMD; going back to an older version is not supported.',retryable:false,newer_version:true,log:false};
  return undefined;
 });
 render(App);
 await screen.findByRole('heading',{name:'OMD couldn’t start'});
 expect(screen.getByRole('alert').textContent).toMatch(/newer version of OMD/);
 expect(screen.queryByRole('button',{name:'Try again'})).toBeNull();
 expect(screen.queryByText('Technical details')).toBeNull();
 await fireEvent.click(screen.getByRole('button',{name:'Get the latest OMD'}));
 await waitFor(()=>expect(native.invoke).toHaveBeenCalledWith('v2_open_source',{url:'https://github.com/NorthWolfLabs/open-media-downloader-desktop/releases/latest'}));
});
it('hides Try again for a damaged install without offering a download',async()=>{
 Object.defineProperty(window,'__TAURI_INTERNALS__',{value:{},configurable:true});
 native.invoke.mockImplementation(async(name:string)=>{
  if(name==='v2_bootstrap_engine')throw {message:'OMD is damaged or incomplete. Reinstall OMD.',retryable:false,newer_version:false,log:false};
  return undefined;
 });
 render(App);
 await screen.findByRole('heading',{name:'OMD couldn’t start'});
 expect(screen.queryByRole('button',{name:'Try again'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Get the latest OMD'})).toBeNull();
});
