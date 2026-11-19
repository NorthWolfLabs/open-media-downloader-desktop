// Public plugin packaging policy. Public builds may bundle only packages listed in
// the tracked packaging/public-plugins.json, matched by exact package digest,
// manifest ID and version. Private builds are an explicit, separate mode.
import {readFile,readdir,lstat} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const desktopRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const publicPolicyPath=path.join(desktopRoot,'packaging','public-plugins.json');
const NAME=/^[a-z0-9][a-z0-9-]{0,63}$/,ID=/^[a-z0-9][a-z0-9.-]{2,127}$/,SHA=/^[a-f0-9]{64}$/;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// The policy location is fixed relative to these scripts so that a caller cannot
// authorize a public plugin by supplying its own name/hash list.
export async function loadPublicPolicy(file=publicPolicyPath){
 const policy=JSON.parse(await readFile(file,'utf8'));
 if(policy?.format!==1||!Array.isArray(policy.plugins)||!Array.isArray(policy.reserved_private_ids)||Object.keys(policy).some(key=>!['format','plugins','reserved_private_ids'].includes(key)))throw new Error('Invalid public plugin policy');
 const reserved=new Set(policy.reserved_private_ids);
 if([...reserved].some(id=>typeof id!=='string'||!ID.test(id))||reserved.size!==policy.reserved_private_ids.length)throw new Error('Invalid reserved private plugin identity');
 const names=new Set,ids=new Set;
 for(const entry of policy.plugins){
  const keys=['name','id','version','sha256','license','review'];
  if(!entry||typeof entry!=='object'||Object.keys(entry).length!==keys.length||keys.some(key=>typeof entry[key]!=='string'||!entry[key]))throw new Error('Invalid public plugin allowlist entry');
  if(!NAME.test(entry.name)||!ID.test(entry.id)||!SHA.test(entry.sha256))throw new Error(`Invalid public plugin allowlist entry: ${entry.name}`);
  if(reserved.has(entry.id))throw new Error(`A private plugin cannot be allowlisted for public distribution: ${entry.id}`);
  if(names.has(entry.name)||ids.has(entry.id))throw new Error(`Duplicate public plugin allowlist entry: ${entry.name}`);
  names.add(entry.name);ids.add(entry.id);
 }
 return {plugins:policy.plugins,reserved};
}

// Reads the plugin manifest embedded in an .omdp package (see omd-service catalog).
export function packageManifest(bytes){
 if(bytes.length<10||bytes.subarray(0,6).toString('latin1')!=='OMDP2\0')throw new Error('Not an OMD plugin package');
 const length=bytes.readUInt32LE(6);
 if(length>64*1024||bytes.length<10+length)throw new Error('Damaged OMD plugin package');
 let manifest;try{manifest=JSON.parse(bytes.subarray(10,10+length).toString('utf8'));}catch{throw new Error('Damaged OMD plugin manifest');}
 if(typeof manifest?.id!=='string'||!ID.test(manifest.id)||typeof manifest.version!=='string'||!manifest.version)throw new Error('Invalid OMD plugin manifest identity');
 return manifest;
}

// Validates a plugin list and returns verified package bytes. Runs before any
// staging work, so rejected input never replaces existing staged resources.
export async function resolvePlugins({mode,manifestFile,policy}){
 if(!['public','private'].includes(mode))throw new Error('--plugin-mode must be public or private');
 if(mode==='private'&&!manifestFile)throw new Error('Private plugin staging requires an explicit --providers manifest');
 const list=manifestFile?JSON.parse(await readFile(manifestFile,'utf8')):[];
 if(!Array.isArray(list)||list.length>256)throw new Error('The plugin manifest must be an array');
 const resolved=[],names=new Set,ids=new Set;
 for(const plugin of list){
  if(!plugin||!NAME.test(plugin.name)||!SHA.test(plugin.sha256)||typeof plugin.path!=='string'||!plugin.path)throw new Error('Invalid plugin package identity');
  if(names.has(plugin.name))throw new Error(`Duplicate plugin package name: ${plugin.name}`);
  const source=path.resolve(path.dirname(manifestFile),plugin.path),info=await lstat(source);
  if(!info.isFile()||info.size>256*1024*1024)throw new Error(`Invalid plugin package file: ${plugin.name}`);
  const bytes=await readFile(source),digest=sha256(bytes);
  if(digest!==plugin.sha256)throw new Error(`Integrity mismatch: ${plugin.name}`);
  const manifest=packageManifest(bytes);
  if(ids.has(manifest.id))throw new Error(`Duplicate plugin ID: ${manifest.id}`);
  if(mode==='public'){
   if(policy.reserved.has(manifest.id))throw new Error(`Private plugin ${manifest.id} cannot be staged for public distribution; use --plugin-mode private for owner testing`);
   const entry=policy.plugins.find(item=>item.name===plugin.name);
   if(!entry||entry.id!==manifest.id||entry.version!==manifest.version||entry.sha256!==digest)throw new Error(`Plugin ${plugin.name} (${manifest.id} ${manifest.version}) is not in the reviewed public allowlist`);
  }
  names.add(plugin.name);ids.add(manifest.id);
  resolved.push({name:plugin.name,id:manifest.id,version:manifest.version,sha256:digest,bytes,source});
 }
 return resolved;
}

// Pre-upload check of a staged public resource tree: every file is inventoried
// with a matching digest, and every plugin is the exact allowlisted package.
export async function checkPublicResources(directory,policy){
 const inventory=JSON.parse(await readFile(path.join(directory,'build-inventory.json'),'utf8'));
 if(inventory.plugins?.mode!=='public'||inventory.plugins.publishable!==true||!Array.isArray(inventory.plugins.packages))throw new Error('The resources were not staged in public plugin mode');
 if(inventory.worker_profile!=='release')throw new Error('The resources do not contain a release worker');
 if(!Array.isArray(inventory.files))throw new Error('Invalid resource inventory');
 const files=new Map;
 for(const file of inventory.files){
  if(typeof file.path!=='string'||file.path.includes('\\')||file.path.split('/').some(part=>!part||part==='.'||part==='..')||!SHA.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<0||files.has(file.path))throw new Error('Invalid or duplicate resource inventory entry');
  files.set(file.path,file);
 }
 const suffix=inventory.platform==='win32'?'.exe':'';
 for(const name of ['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'])if(!files.has(`bin/${name}${suffix}`))throw new Error(`Missing required runtime: ${name}`);
 const present=[];
 async function visit(relative){
  const info=await lstat(path.join(directory,relative));
  if(info.isSymbolicLink())throw new Error(`Unexpected symlink: ${relative}`);
  if(info.isDirectory()){for(const name of await readdir(path.join(directory,relative)))await visit(relative?`${relative}/${name}`:name);}
  else if(!info.isFile())throw new Error(`Unexpected special file: ${relative}`);
  else if(relative!=='build-inventory.json')present.push(relative);
 }
 await visit('');
 for(const relative of present){
  const file=files.get(relative);
  if(!file)throw new Error(`Uninventoried resource: ${relative}`);
  const bytes=await readFile(path.join(directory,relative));
  if(bytes.length!==file.size||sha256(bytes)!==file.sha256)throw new Error(`Resource changed after staging: ${relative}`);
  if(bytes.subarray(0,6).toString('latin1')==='OMDP2\0'&&!relative.startsWith('providers/'))throw new Error(`Plugin package outside the catalog: ${relative}`);
  if(relative===`bin/omd-plugin-worker-v2${suffix}`&&!bytes.includes(Buffer.from('OMD_WORKER_PROFILE=release')))throw new Error('The packaged worker is not a release worker');
 }
 if(present.length!==files.size)throw new Error('Inventoried resources are missing');
 const packagePaths=new Set(inventory.plugins.packages.map(item=>item.path));
 if(packagePaths.size!==inventory.plugins.packages.length)throw new Error('Duplicate plugin inventory entry');
 const staged=present.filter(relative=>relative.startsWith('providers/'));
 if(staged.length!==inventory.plugins.packages.length)throw new Error('Plugin files do not match the plugin inventory');
 for(const relative of staged){
  const bytes=await readFile(path.join(directory,relative)),manifest=packageManifest(bytes),digest=sha256(bytes);
  if(policy.reserved.has(manifest.id))throw new Error(`Private plugin found in public resources: ${manifest.id}`);
  const entry=policy.plugins.find(item=>`providers/${item.name}.omdp`===relative);
  if(!entry||entry.id!==manifest.id||entry.version!==manifest.version||entry.sha256!==digest)throw new Error(`Plugin not in the public allowlist: ${relative}`);
  const recorded=inventory.plugins.packages.find(item=>item.path===relative);
  if(!recorded||recorded.name!==entry.name||recorded.id!==manifest.id||recorded.version!==manifest.version||recorded.sha256!==digest)throw new Error(`Plugin inventory does not match its package: ${relative}`);
 }
 return {files:present.length,plugins:staged.length};
}

if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--check-public')throw new Error('Use: vp exec node scripts/plugin-policy.mjs --check-public /absolute/resources/v2');
 const result=await checkPublicResources(path.resolve(args[1]),await loadPublicPolicy());
 console.log(`Public resources verified: ${result.files} files, ${result.plugins} allowlisted plugins`);
}
