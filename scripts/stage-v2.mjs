// Explicit input paths keep the desktop build independent of sibling checkouts.
import {readFile,writeFile,mkdir,chmod,stat,realpath,lstat,readdir,mkdtemp,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPublicPolicy,resolvePlugins,checkPublicResources} from './plugin-policy.mjs';
import {validate as validateMaterials,validateNativeReceipt} from './materials-contract.mjs';
const usage='Use --engine-bin DIR --tools MANIFEST --browser-tools MANIFEST [--plugin-mode public|private] [--providers MANIFEST]';
const options=new Set(['engine-bin','tools','browser-tools','providers','plugin-mode','supplements','output','target','staging-mode','materials','materials-locks','version','materials-binding']);
const args=process.argv.slice(2),input={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw new Error(usage);const key=args[i].slice(2);if(!options.has(key)||key in input)throw new Error(usage);input[key]=['target','plugin-mode','staging-mode','version','materials-binding'].includes(key)?args[i+1]:path.resolve(args[i+1]);}
const stagingMode=input['staging-mode']??'development';
if(!['development','release'].includes(stagingMode))throw new Error('Invalid staging mode');
if(stagingMode==='release'&&(!input.materials||!input['materials-locks']||!input.version))throw new Error('Release staging requires materials, locks and version');
// Two-phase release staging is an explicit opt-in: the desktop executable and its
// embedded frontend do not exist yet, so their components are deferred to the final
// binding of the signed payload (engine scripts/bind-final-materials.py). The default
// single-phase release mode still requires them here and therefore still fails.
const materialsBinding=input['materials-binding']??'single-phase';
if(!['single-phase','two-phase'].includes(materialsBinding)||(materialsBinding==='two-phase'&&stagingMode!=='release'))throw new Error('Two-phase materials binding requires release staging');
const target=input.target??`${process.platform}-${process.arch}`;
if(!['darwin-arm64','darwin-x64','linux-x64','win32-x64'].includes(target))throw new Error('Unsupported packaging target; use darwin-arm64, darwin-x64, linux-x64 or win32-x64');
const [targetPlatform,targetArch]=target.split('-');
for(const key of ['engine-bin','tools','browser-tools'])if(!input[key])throw new Error(`Missing --${key}`);
// Public is the default. Its plugin set is the tracked reviewed allowlist (empty
// unless a public starter plugin is accepted); private owner builds must opt in.
const pluginMode=input['plugin-mode']??'public';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=input.output??path.join(desktop,'src-tauri','resources','v2');
await mkdir(path.dirname(destination),{recursive:true});
// Reject plugin and worker inputs before creating any staging directory.
const policy=await loadPublicPolicy();
const plugins=await resolvePlugins({mode:pluginMode,manifestFile:input.providers,policy});
// A debug Wasmtime worker keys its cache by executable mtime, making every
// rebuilt/signed preview recompile providers during the user's first request.
const workerBytes=await readFile(path.join(input['engine-bin'],'omd-plugin-worker-v2'+(targetPlatform==='win32'?'.exe':'')));
if(!workerBytes.includes(Buffer.from('OMD_WORKER_PROFILE=release')))throw new Error('Package an optimized release omd-plugin-worker-v2; debug workers invalidate the source cache on every rebuild.');
const out=await mkdtemp(path.join(path.dirname(destination),'.omd-v2-stage-'));
try {
const manifest=JSON.parse(await readFile(input.tools,'utf8')),report={platform:targetPlatform,arch:targetArch,build_host:{platform:process.platform,arch:process.arch},files:[]};
async function copy(source,destination,expected,supplied){const bytes=supplied??await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex');if(expected&&expected!==sha256)throw new Error(`Integrity mismatch: ${path.basename(source)}`);if(report.files.some(file=>file.path===destination))throw new Error(`Duplicate package input: ${destination}`);const dest=path.join(out,destination);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,bytes,{flag:'wx'});if((await stat(source)).mode&0o111)await chmod(dest,0o755);report.files.push({path:destination,sha256,size:bytes.length});}
await copy(path.join(desktop,'LICENSE'),'LICENSE');
report.worker_profile='release';
for(const binary of ['omd-engine' ,'omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd']){const name=binary+(targetPlatform==='win32'?'.exe':'');await copy(path.join(input['engine-bin'],name),`bin/${name}`);}
const tools={};for(const name of ['yt_dlp','ffmpeg','ffprobe','node']){const tool=manifest[name];if(!tool||typeof tool.path!=='string'||!tool.path||typeof tool.version!=='string'||!tool.version||typeof tool.sha256!=='string'||!/^[a-f0-9]{64}$/.test(tool.sha256))throw new Error(`Invalid packaged tool ${name}: path, version and SHA-256 are required`);const source=await realpath(path.resolve(path.dirname(input.tools),tool.path));const destination=`tools/${name}/${path.basename(source)}`;await copy(source,destination,tool.sha256);tools[name]={...tool,path:`${name}/${path.basename(source)}`};}
await generated('tools/tools-v2.json',tools);
const browser=JSON.parse(await readFile(input['browser-tools'],'utf8'));
const browserRoot=path.resolve(path.dirname(input['browser-tools']),browser.root);
if(!browser.files||!Object.keys(browser.files).length||Object.keys(browser.files).length>8192||!browser.files[browser.browser]||!browser.files[browser.adapter])throw new Error('Invalid browser inventory');
if(browser.node?.sha256!==manifest.node.sha256||browser.node?.version!==manifest.node.version)throw new Error('Browser and media tools must use the same approved Node input');
let fileCount=0,directoryCount=0,browserBytes=0;
async function copyBrowser(directory,prefix=''){
 if((await lstat(directory)).isSymbolicLink())throw new Error('Browser inventory cannot contain symlinks');
 for(const name of await readdir(directory)){
  const source=path.join(directory,name),relative=prefix+name,info=await lstat(source);
  if(info.isSymbolicLink())throw new Error('Browser inventory cannot contain symlinks');
  if(info.isDirectory()){
   if(++directoryCount>2048||relative.length>1024)throw new Error('Browser directory budget exceeded');
   await copyBrowser(source,relative+'/');
  }else{
   const expected=browser.files[relative];
   if(!info.isFile()||!expected||expected.bytes!==info.size||!/^[a-f0-9]{64}$/.test(expected.sha256))throw new Error(`Unexpected browser input: ${relative}`);
   browserBytes+=info.size;if(browserBytes>1024*1024*1024)throw new Error('Browser size budget exceeded');
   await copy(source,`browser/content/${relative}`,expected.sha256);fileCount++;
  }
 }
}
await copyBrowser(browserRoot);
if(fileCount!==Object.keys(browser.files).length)throw new Error('The browser inventory has missing files');
await generated('browser/browser-tools-v2.json',{...browser,root:'content',node:{...browser.node,path:`../tools/${tools.node.path}`}});
// An empty plugin set stages no providers directory; the engine catalog treats
// a missing directory as an empty catalog and users import plugins from Sources.
report.plugins={mode:pluginMode,publishable:pluginMode==='public',packages:[]};
for(const plugin of plugins){const relative=`providers/${plugin.name}.omdp`;await copy(plugin.source,relative,plugin.sha256,plugin.bytes);report.plugins.packages.push({name:plugin.name,id:plugin.id,version:plugin.version,sha256:plugin.sha256,path:relative});}
// Notices and complete source/relink kits travel with the installed application.
// They are pinned package inputs, never runtime code or engine API payloads.
if(input.supplements){
 const supplements=JSON.parse(await readFile(input.supplements,'utf8'));
 if(!Array.isArray(supplements)||supplements.length>100)throw new Error('Invalid third-party supplement inventory');
 for(const file of supplements){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(file.name)||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('Invalid third-party supplement identity');
  const source=path.resolve(path.dirname(input.supplements),file.path),info=await lstat(source);
  if(!info.isFile()||info.isSymbolicLink()||info.size>256*1024*1024)throw new Error('Invalid third-party supplement file');
  await copy(source,`third-party/${file.name}`,file.sha256);
 }
}
async function generated(relative,value){
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
 await writeFile(path.join(out,relative),bytes,{flag:'wx'});
 report.files.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length});
}
report.staging_mode=stagingMode;report.release_accepted=false;report.materials={coverage_validated:false};
if(stagingMode==='release'){
 const locks={};for(const name of ['Cargo.lock','browser-package-lock.json','desktop-Cargo.lock','desktop-package-lock.json'])locks[name]=createHash('sha256').update(await readFile(path.join(input['materials-locks'],name))).digest('hex');
 // Desktop lock identities must also match this independent checkout.
 for(const [name,file] of [['desktop-Cargo.lock','src-tauri/Cargo.lock'],['desktop-package-lock.json','package-lock.json']])if(locks[name]!==createHash('sha256').update(await readFile(path.join(desktop,file))).digest('hex'))throw new Error('Stale desktop lock');
 if(locks['browser-package-lock.json']!==createHash('sha256').update(await readFile(path.join(out,'browser/content/adapter/package-lock.json'))).digest('hex'))throw new Error('Stale browser lock');
 const triple={'darwin-arm64':'aarch64-apple-darwin','darwin-x64':'x86_64-apple-darwin','linux-x64':'x86_64-unknown-linux-gnu','win32-x64':'x86_64-pc-windows-msvc'}[target];
 validateNativeReceipt(JSON.parse(await readFile(path.join(out,'third-party/native-receipt.json'),'utf8')),Object.fromEntries(report.files.map(x=>[x.path,x.sha256])),['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'],locks['Cargo.lock'],triple,await readFile(path.join(out,'third-party/native-NOTICES.txt')),input.version);
 const required=Object.fromEntries(['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'].map(id=>[id,{version:input.version,prefix:'bin/'+id+(targetPlatform==='win32'?'.exe':'')}]));
 for(const id of ['yt_dlp','ffmpeg','ffprobe','node'])required[id]={version:manifest[id].version,prefix:'tools/'+id+'/'};
 required.browser={version:browser.version,prefix:'browser/content/'};
 const deferred=['desktop-rust','frontend'];
 if(materialsBinding==='single-phase'){required['desktop-rust']={version:JSON.parse(await readFile(path.join(desktop,'package.json'),'utf8')).version,prefix:'native/'};required.frontend={version:JSON.parse(await readFile(path.join(desktop,'package.json'),'utf8')).version,prefix:'frontend/'};}
 report.materials=validateMaterials(JSON.parse(await readFile(input.materials,'utf8')),Object.fromEntries(report.files.map(x=>[x.path,x.sha256])),required,target,input.version,locks);
 if(materialsBinding==='two-phase')report.materials={...report.materials,binding:'two-phase',deferred};
 await copy(input.materials,'third-party/materials-v1.json');
}
await writeFile(path.join(out,'build-inventory.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
if(pluginMode==='public')await checkPublicResources(out,policy);
// Staging is a build-owned directory. Preserve arbitrary directories and failed builds.
let previous=false;
try {
 const info=await lstat(destination);
 if(!info.isDirectory()||info.isSymbolicLink())throw new Error('The staging destination is not an owned directory');
 const inventory=JSON.parse(await readFile(path.join(destination,'build-inventory.json'),'utf8'));
 if(!Array.isArray(inventory.files)||!inventory.files.some(file=>file.path.startsWith('bin/omd-engine')))throw new Error('The staging destination has no valid OMD inventory');
 previous=true;
}catch(error){if(error.code!=='ENOENT')throw error;else if(await lstat(destination).catch(()=>null))throw new Error('Refusing to replace a directory without an OMD build inventory');}
const backup=out+'-previous';
if(previous)await rename(destination,backup);
try{await rename(out,destination);}catch(error){if(previous)await rename(backup,destination);throw error;}
if(previous)await rm(backup,{recursive:true});
console.log(`Staged ${report.files.length} verified files (${pluginMode} plugins: ${plugins.length}) in ${destination}`);
} finally {await rm(out,{recursive:true,force:true});}
