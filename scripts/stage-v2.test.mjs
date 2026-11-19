import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,readdir,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const desktop=join(dirname(fileURLToPath(import.meta.url)),'..');
const exe=process.platform==='win32'?'.exe':'';
// Synthetic package with the same header/manifest framing as a real .omdp.
const omdp=(id,version='0.1.0')=>{const manifest=Buffer.from(JSON.stringify({id,name:id,version})),length=Buffer.alloc(4);length.writeUInt32LE(manifest.length);return Buffer.concat([Buffer.from('OMDP2\0','latin1'),length,manifest,Buffer.from('synthetic payload')]);};

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'omd-staging-'));
 const bin=join(root,'bin'),browser=join(root,'browser');await mkdir(bin);await mkdir(browser);
 for(const name of ['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'])await writeFile(join(bin,name+exe),name==='omd-plugin-worker-v2'?'OMD_WORKER_PROFILE=release':name);
 await writeFile(join(root,'tool'),'fixture tool');const tool={path:'tool',version:'fixture',sha256:digest('fixture tool')};
 await writeFile(join(root,'tools.json'),JSON.stringify(Object.fromEntries(['node','yt_dlp','ffmpeg','ffprobe'].map(name=>[name,tool]))));
 await writeFile(join(browser,'adapter'),'adapter');await writeFile(join(browser,'browser'),'browser');
 await writeFile(join(root,'browser.json'),JSON.stringify({root:'browser',node:tool,browser:'browser',adapter:'adapter',files:Object.fromEntries(['adapter','browser'].map(name=>[name,{sha256:digest(name),bytes:name.length}]))}));
 const plugins=async(name,entries)=>{const file=join(root,name);await writeFile(file,JSON.stringify(await Promise.all(entries.map(async([plugin,bytes])=>{await writeFile(join(root,plugin+'.omdp'),bytes);return {name:plugin,path:plugin+'.omdp',sha256:digest(bytes)};}))));return file;};
 const output=join(root,'output');
 const run=(extra=[],script=join(desktop,'scripts/stage-v2.mjs'))=>spawnSync(process.execPath,[script,'--engine-bin',bin,'--tools',join(root,'tools.json'),'--browser-tools',join(root,'browser.json'),'--output',output,...extra],{encoding:'utf8'});
 const check=(script=join(desktop,'scripts/plugin-policy.mjs'))=>spawnSync(process.execPath,[script,'--check-public',output],{encoding:'utf8'});
 return {root,bin,browser,output,plugins,run,check,inventory:async()=>JSON.parse(await readFile(join(output,'build-inventory.json'),'utf8')),cleanup:()=>rm(root,{recursive:true,force:true})};
}
const leftovers=async root=>(await readdir(root)).filter(name=>name.startsWith('.omd-v2-stage-'));

test('the tracked public policy ships no plugins and reserves the synthetic private identity',async()=>{
 const policy=JSON.parse(await readFile(join(desktop,'packaging/public-plugins.json'),'utf8'));
 assert.deepEqual(policy.plugins,[]);
 assert.deepEqual(policy.reserved_private_ids,['org.example.private']);
});

test('public staging succeeds with no plugins and passes the pre-upload check',async()=>{
 const f=await fixture();
 try{
  const result=f.run();assert.equal(result.status,0,result.stderr);
  const inventory=await f.inventory();
  assert.deepEqual(inventory.plugins,{mode:'public',publishable:true,packages:[]});
  assert.equal(inventory.worker_profile,'release');
  assert.equal(await readFile(join(f.output,'LICENSE'),'utf8'),await readFile(join(desktop,'LICENSE'),'utf8'));
  assert.ok(!inventory.files.some(file=>file.path.startsWith('providers/')));
  assert.ok(!(await readdir(f.output)).includes('providers'),'the engine catalog treats a missing providers directory as empty');
  for(const binary of ['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'])assert.ok(inventory.files.some(file=>file.path===`bin/${binary}${exe}`));
  const checked=f.check();assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/0 allowlisted plugins/);
  // Anything added after staging fails the pre-upload check.
  await mkdir(join(f.output,'providers'));await writeFile(join(f.output,'providers/extra.omdp'),omdp('org.example.extra'));
  assert.notEqual(f.check().status,0);
 }finally{await f.cleanup();}
});

test('public staging rejects private and unlisted plugins before replacing staged resources',async()=>{
 const f=await fixture();
 try{
  assert.equal(f.run().status,0);
  const prior=await readFile(join(f.output,'build-inventory.json'),'utf8');
  // A known private identity is rejected without its real package; a matching
  // caller-supplied name/hash list is not public authorization.
  const privateList=await f.plugins('private.json',[['private-source',omdp('org.example.private','9.9.9')]]);
  let result=f.run(['--providers',privateList]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/Private plugin org\.example\.private cannot be staged for public/);
  result=f.run(['--plugin-mode','public','--providers',await f.plugins('unlisted.json',[['starter',omdp('org.example.starter')]])]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/not in the reviewed public allowlist/);
  result=f.run(['--plugin-mode','release']);assert.notEqual(result.status,0);assert.match(result.stderr,/public or private/);
  assert.equal(await readFile(join(f.output,'build-inventory.json'),'utf8'),prior);
  assert.deepEqual(await leftovers(f.root),[]);
 }finally{await f.cleanup();}
});

test('private staging is explicit, verified, and never passes the public check',async()=>{
 const f=await fixture();
 try{
  let result=f.run(['--plugin-mode','private']);assert.notEqual(result.status,0);assert.match(result.stderr,/requires an explicit --providers/);
  const bytes=omdp('org.example.private','9.9.9');
  const list=await f.plugins('private.json',[['private-source',bytes],['other',omdp('org.example.other')]]);
  result=f.run(['--plugin-mode','private','--providers',list]);assert.equal(result.status,0,result.stderr);
  const inventory=await f.inventory();
  assert.equal(inventory.plugins.mode,'private');assert.equal(inventory.plugins.publishable,false);
  assert.deepEqual(inventory.plugins.packages.map(p=>[p.name,p.id,p.path]),[['private-source','org.example.private','providers/private-source.omdp'],['other','org.example.other','providers/other.omdp']]);
  assert.deepEqual(await readFile(join(f.output,'providers/private-source.omdp')),bytes);
  const checked=f.check();assert.notEqual(checked.status,0);assert.match(checked.stderr,/not staged in public plugin mode/);
  // Private packages still need exact digests and valid package framing.
  const prior=await readFile(join(f.output,'build-inventory.json'),'utf8');
  await writeFile(join(f.root,'private-source.omdp'),omdp('org.example.private','9.9.10'));
  result=f.run(['--plugin-mode','private','--providers',list]);assert.notEqual(result.status,0);assert.match(result.stderr,/Integrity mismatch: private-source/);
  const damaged=Buffer.from('not a package');await writeFile(join(f.root,'damaged.json'),JSON.stringify([{name:'damaged',path:'damaged.omdp',sha256:digest(damaged)}]));await writeFile(join(f.root,'damaged.omdp'),damaged);
  result=f.run(['--plugin-mode','private','--providers',join(f.root,'damaged.json')]);assert.notEqual(result.status,0);assert.match(result.stderr,/Not an OMD plugin package/);
  assert.equal(await readFile(join(f.output,'build-inventory.json'),'utf8'),prior);
  // A later public staging atomically replaces the private tree.
  result=f.run();assert.equal(result.status,0,result.stderr);
  assert.ok(!(await readdir(f.output)).includes('providers'));assert.equal(f.check().status,0);
 }finally{await f.cleanup();}
});

test('a reviewed allowlist entry admits only its exact public package',async()=>{
 const f=await fixture();
 try{
  // Copy the current scripts into an isolated desktop layout with a test policy.
  const copy=join(f.root,'desktop');await mkdir(join(copy,'packaging'),{recursive:true});
  await cp(join(desktop,'LICENSE'),join(copy,'LICENSE'));
  await cp(join(desktop,'scripts/materials-contract.mjs'),join(copy,'scripts/materials-contract.mjs'));
  await cp(join(desktop,'scripts/stage-v2.mjs'),join(copy,'scripts/stage-v2.mjs'));await cp(join(desktop,'scripts/plugin-policy.mjs'),join(copy,'scripts/plugin-policy.mjs'));
  const bytes=omdp('org.example.starter','1.0.0'),policy=JSON.parse(await readFile(join(desktop,'packaging/public-plugins.json'),'utf8'));
  const entry={name:'starter',id:'org.example.starter',version:'1.0.0',sha256:digest(bytes),license:'MIT',review:'synthetic fixture'};
  await writeFile(join(copy,'packaging/public-plugins.json'),JSON.stringify({...policy,plugins:[entry]}));
  const script=join(copy,'scripts/stage-v2.mjs'),checker=join(copy,'scripts/plugin-policy.mjs');
  let result=f.run(['--providers',await f.plugins('starter.json',[['starter',bytes]])],script);assert.equal(result.status,0,result.stderr);
  assert.deepEqual((await f.inventory()).plugins.packages.map(p=>p.id),['org.example.starter']);
  assert.equal(f.check(checker).status,0);assert.notEqual(f.check().status,0,'the tracked empty policy rejects the same resources');
  result=f.run(['--providers',await f.plugins('changed.json',[['starter',omdp('org.example.starter','1.0.1')]])],script);assert.notEqual(result.status,0);assert.match(result.stderr,/not in the reviewed public allowlist/);
  result=f.run(['--providers',await f.plugins('renamed.json',[['other',bytes]])],script);assert.notEqual(result.status,0);
  // Private identities cannot be allowlisted.
  await writeFile(join(copy,'packaging/public-plugins.json'),JSON.stringify({...policy,plugins:[{...entry,id:'org.example.private'}]}));
  result=f.run([],script);assert.notEqual(result.status,0);assert.match(result.stderr,/private plugin cannot be allowlisted/);
 }finally{await f.cleanup();}
});

test('staging rejects debug workers before creating any staging directory',async()=>{
 const f=await fixture();
 try{
  await writeFile(join(f.bin,'omd-plugin-worker-v2'+exe),'OMD_WORKER_PROFILE=debug');
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/optimized release/);
  assert.deepEqual(await readdir(f.root).then(names=>names.filter(name=>name==='output'||name.startsWith('.omd-v2-stage-'))),[]);
 }finally{await f.cleanup();}
});

test('staging publishes a complete inventory, replaces stale files, and preserves the previous package on failure',async()=>{
 const f=await fixture(),{root,bin,browser,output}=f;
 try{
  await writeFile(join(root,'notice.txt'),'fixture notice');await writeFile(join(root,'supplements.json'),JSON.stringify([{name:'NOTICE.txt',path:'notice.txt',sha256:digest('fixture notice')} ]));
  const list=await f.plugins('providers.json',[['source',omdp('org.example.source')]]);
  const run=()=>f.run(['--plugin-mode','private','--providers',list,'--supplements',join(root,'supplements.json')]);
  let result=run();assert.equal(result.status,0,result.stderr);
  const first=await f.inventory();
  assert.ok(first.files.some(file=>file.path==='browser/browser-tools-v2.json'));
  assert.ok(first.files.some(file=>file.path==='tools/tools-v2.json'));
  assert.ok(first.files.some(file=>file.path==='third-party/NOTICE.txt'));
  assert.ok(first.files.some(file=>file.path==='providers/source.omdp'));
  for(const file of first.files)assert.equal(digest(await readFile(join(output,file.path))),file.sha256);
  await writeFile(join(output,'browser/content/obsolete'),'old generated file');
  result=run();assert.equal(result.status,0,result.stderr);
  assert.ok(!(await readdir(join(output,'browser/content'))).includes('obsolete'));
  const prior=await readFile(join(output,'build-inventory.json'),'utf8');
  const worker=join(bin,'omd-plugin-worker-v2'+exe);
  await writeFile(worker,'OMD_WORKER_PROFILE=debug');result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/optimized release/);assert.equal(await readFile(join(output,'build-inventory.json'),'utf8'),prior);await writeFile(worker,'OMD_WORKER_PROFILE=release');
  await writeFile(join(browser,'adapter'),'changed without review');
  result=run();assert.notEqual(result.status,0);assert.equal(await readFile(join(output,'build-inventory.json'),'utf8'),prior);
  assert.deepEqual(await leftovers(root),[]);
  await writeFile(join(browser,'adapter'),'adapter');await writeFile(join(root,'notice.txt'),'unreviewed');
  result=run();assert.notEqual(result.status,0);assert.equal(await readFile(join(output,'build-inventory.json'),'utf8'),prior);
  await writeFile(join(root,'notice.txt'),'fixture notice');
  await rm(output,{recursive:true});await mkdir(output);await writeFile(join(output,'personal'),'keep');
  result=run();assert.notEqual(result.status,0);assert.equal(await readFile(join(output,'personal'),'utf8'),'keep');
  result=f.run();assert.notEqual(result.status,0,'public staging also refuses unowned directories');assert.equal(await readFile(join(output,'personal'),'utf8'),'keep');
 }finally{await f.cleanup();}
});


test('public staging rejects plugin packages hidden in supplements and preserves prior output',async()=>{
 const f=await fixture();
 try{
  assert.equal(f.run().status,0);
  const prior=await readFile(join(f.output,'build-inventory.json'),'utf8');
  const bytes=omdp('org.example.private');
  await writeFile(join(f.root,'notice.txt'),bytes);
  await writeFile(join(f.root,'supplements.json'),JSON.stringify([{name:'NOTICE.txt',path:'notice.txt',sha256:digest(bytes)}]));
  const result=f.run(['--supplements',join(f.root,'supplements.json')]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/Plugin package outside the catalog/);
  assert.equal(await readFile(join(f.output,'build-inventory.json'),'utf8'),prior);
  assert.deepEqual(await leftovers(f.root),[]);
 }finally{await f.cleanup();}
});

test('the public checker rejects missing runtime and duplicate inventory entries',async()=>{
 const f=await fixture();
 try{
  assert.equal(f.run().status,0);
  const original=await f.inventory(),file=join(f.output,'build-inventory.json');
  await rm(join(f.output,'bin','omd'+exe));
  await writeFile(file,JSON.stringify({...original,files:original.files.filter(item=>item.path!=='bin/omd'+exe)}));
  let result=f.check();assert.notEqual(result.status,0);assert.match(result.stderr,/Missing required runtime/);
  assert.equal(f.run().status,0);
  const current=await f.inventory();current.files.push(current.files[0]);
  await writeFile(file,JSON.stringify(current));
  result=f.check();assert.notEqual(result.status,0);assert.match(result.stderr,/duplicate resource inventory/);
 }finally{await f.cleanup();}
});


test('managed tools require an approved SHA-256 and reject mismatches without replacing output',async()=>{
 const f=await fixture();
 try{
  assert.equal(f.run().status,0);
  const prior=await readFile(join(f.output,'build-inventory.json'),'utf8');
  const path=join(f.root,'tools.json'),original=JSON.parse(await readFile(path,'utf8'));
  for(const name of ['yt_dlp','ffmpeg','ffprobe','node']){
   for(const hash of [undefined,'','not-a-digest']){
    const tools=structuredClone(original);tools[name].sha256=hash;
    await writeFile(path,JSON.stringify(tools));
    const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(`Invalid packaged tool ${name}`));
    assert.equal(await readFile(join(f.output,'build-inventory.json'),'utf8'),prior);
   }
  }
  const changed=structuredClone(original);changed.ffmpeg.sha256='0'.repeat(64);await writeFile(path,JSON.stringify(changed));
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Integrity mismatch/);
  assert.equal(await readFile(join(f.output,'build-inventory.json'),'utf8'),prior);
  assert.deepEqual(await leftovers(f.root),[]);
 }finally{await f.cleanup();}
});

test('release staging rejects missing coverage before changing output',async()=>{
 const f=await fixture();try{assert.equal(f.run().status,0);const before=await readFile(join(f.output,'build-inventory.json'));const result=f.run(['--staging-mode','release']);assert.notEqual(result.status,0);assert.match(result.stderr,/requires materials/);assert.deepEqual(await readFile(join(f.output,'build-inventory.json')),before);}finally{await f.cleanup();}
});

test('two-phase release staging defers only the desktop executable components; single-phase still fails',async()=>{
 const f=await fixture();
 try{
  const native=JSON.parse(await readFile(join(desktop,'packaging/materials-contract-fixtures-v1.json'),'utf8')).native;
  const names=['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'];
  // The browser kit needs an adapter lock: replace the fixture kit in place.
  await rm(join(f.browser,'adapter'));await mkdir(join(f.browser,'adapter'));
  const kit={'adapter/adapter.mjs':'export {}\n','adapter/package-lock.json':'{"lockfileVersion":3}\n',browser:'browser'};
  for(const [rel,data] of Object.entries(kit))await writeFile(join(f.browser,rel),data);
  const tool={path:'tool',version:'fixture',sha256:digest('fixture tool')};
  await writeFile(join(f.root,'browser.json'),JSON.stringify({root:'browser',version:'fixture-browser',node:tool,browser:'browser',adapter:'adapter/adapter.mjs',files:Object.fromEntries(Object.entries(kit).map(([rel,data])=>[rel,{sha256:digest(data),bytes:Buffer.byteLength(data)}]))}));
  const locks=join(f.root,'locks');await mkdir(locks);
  await writeFile(join(locks,'Cargo.lock'),'# engine lock\n');await writeFile(join(locks,'browser-package-lock.json'),kit['adapter/package-lock.json']);
  await cp(join(desktop,'src-tauri/Cargo.lock'),join(locks,'desktop-Cargo.lock'));await cp(join(desktop,'package-lock.json'),join(locks,'desktop-package-lock.json'));
  const binaries=Object.fromEntries(names.map(n=>[n,n==='omd-plugin-worker-v2'?'OMD_WORKER_PROFILE=release':n]));
  const receipt={...structuredClone(native.receipt),binaries:names,binary_roots:Object.fromEntries(names.map(n=>[n,native.receipt.roots[0]])),lock_sha256:digest('# engine lock\n'),
   artifacts:names.map(n=>({name:n,sha256:digest(binaries[n]),bytes:binaries[n].length}))};
  await writeFile(join(f.root,'native-receipt.json'),JSON.stringify(receipt));await writeFile(join(f.root,'native-NOTICES.txt'),native.notice_text);
  await writeFile(join(f.root,'supplements.json'),JSON.stringify(['native-receipt.json','native-NOTICES.txt'].map(name=>({name,path:name,sha256:digest(name==='native-receipt.json'?JSON.stringify(receipt):native.notice_text)}))));
  const args=['--supplements',join(f.root,'supplements.json'),'--staging-mode','release','--materials-locks',locks,'--version',native.version,'--target','darwin-arm64'];
  // Release staging: v1 reviews the resources exactly as staged (before build-inventory and the manifest itself).
  let result=f.run(['--supplements',join(f.root,'supplements.json'),'--target','darwin-arm64']);assert.equal(result.status,0,result.stderr);
  const staged=Object.fromEntries((await f.inventory()).files.map(x=>[x.path,x.sha256]));
  const pick=(...paths)=>Object.fromEntries(paths.map(p=>[p,staged[p]]));
  const materials={notices:pick('third-party/native-NOTICES.txt'),source:pick('LICENSE'),instructions:pick('LICENSE'),provenance:pick('third-party/native-receipt.json','tools/tools-v2.json','browser/browser-tools-v2.json')};
  const component=(id,version,artifacts)=>({id,version,status:'reviewed',pending:[],artifacts,materials});
  const manifest={schema:'omd-materials-v1',reviewed:true,pending:[],target:'darwin-arm64',version:native.version,locks:Object.fromEntries(await Promise.all(['Cargo.lock','browser-package-lock.json','desktop-Cargo.lock','desktop-package-lock.json'].map(async n=>[n,digest(await readFile(join(locks,n)))]))),
   components:[...names.map(n=>component(n,native.version,pick('bin/'+n+exe))),...['yt_dlp','ffmpeg','ffprobe','node'].map(n=>component(n,'fixture',Object.fromEntries(Object.entries(staged).filter(([p])=>p.startsWith(`tools/${n}/`))))),
    component('browser','fixture-browser',Object.fromEntries(Object.entries(staged).filter(([p])=>p.startsWith('browser/content/'))))]};
  await writeFile(join(f.root,'materials.json'),JSON.stringify(manifest));
  const before=await readFile(join(f.output,'build-inventory.json'));
  result=f.run([...args,'--materials',join(f.root,'materials.json')]);
  assert.notEqual(result.status,0);assert.match(result.stderr,/Missing required components/);assert.deepEqual(await readFile(join(f.output,'build-inventory.json')),before);
  result=f.run([...args,'--materials',join(f.root,'materials.json'),'--materials-binding','three-phase']);assert.notEqual(result.status,0);assert.match(result.stderr,/requires release staging/);
  result=f.run(['--materials-binding','two-phase']);assert.notEqual(result.status,0);assert.match(result.stderr,/requires release staging/);
  result=f.run([...args,'--materials',join(f.root,'materials.json'),'--materials-binding','two-phase']);assert.equal(result.status,0,result.stderr);
  const inventory=await f.inventory();
  assert.deepEqual(inventory.materials,{schema:'omd-materials-v1',coverage_validated:true,release_accepted:false,binding:'two-phase',deferred:['desktop-rust','frontend']});
  assert.equal(inventory.staging_mode,'release');assert.equal(inventory.release_accepted,false);
  assert.equal(digest(await readFile(join(f.output,'third-party/materials-v1.json'))),digest(JSON.stringify(manifest)));
 }finally{await f.cleanup();}
});
