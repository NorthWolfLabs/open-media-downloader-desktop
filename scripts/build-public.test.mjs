import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,copyFile,rm,cp,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PUBLIC,mergePatch,cargoPackage,publicConfig,checkPublicConfig,checkPublicStaging,checkBundleInfo,
 LOGICAL,rustOverrides,cargoConfigFiles,publicCargoEnvironment,rustPathRemap,encodeRustflags,rustToolchain,publicRustPaths,hostPathLeaks} from './build-public.mjs';

const desktop=join(dirname(fileURLToPath(import.meta.url)),'..');
const tauri=join(desktop,'src-tauri');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const DEVELOPMENT='labs.northwolf.omd-v2-development';
const versions=async()=>({npm:(await json(join(desktop,'package.json'))).version,cargo:cargoPackage(await readFile(join(tauri,'Cargo.toml'),'utf8')).version});

test('the public overlay applies the stable identity and current version over the development base',async()=>{
 const config=await publicConfig(),v=await versions();
 assert.equal(config.productName,'OMD');
 assert.equal(config.identifier,'labs.northwolf.omd');
 assert.equal(config.version,'0.2.3');
 assert.equal(config.bundle.publisher,'North Wolf Labs LLC');
 assert.equal(config.bundle.copyright,'© 2026 North Wolf Labs LLC');
 assert.equal(v.npm,config.version);assert.equal(v.cargo,config.version);
 assert.deepEqual(cargoPackage(await readFile(join(tauri,'Cargo.toml'),'utf8')),{name:'open-media-downloader-desktop',version:'0.2.3'});
 checkPublicConfig(config,v);
});

test('the public overlay keeps every reviewed window, security, icon and bundle property',async()=>{
 const base=await json(join(tauri,'tauri.conf.json')),pkg=await json(join(tauri,'tauri.v2.package.conf.json')),overlay=await json(join(tauri,'tauri.public.conf.json'));
 const config=mergePatch(base,overlay);
 // Tauri replaces arrays, so the overlay must restate the complete window.
 assert.deepEqual(overlay.app.windows,config.app.windows);
 assert.deepEqual(config.app.windows,pkg.app.windows);
 assert.deepEqual(config.app.windows,[{...base.app.windows[0],title:'OMD',devtools:false}]);
 // The overlay restates these shipping values instead of inheriting them from the base.
 assert.deepEqual(overlay.app.security,config.app.security);
 for(const key of ['icon','macOS','resources','targets','publisher','copyright'])assert.deepEqual(overlay.bundle[key],config.bundle[key],key);
 assert.deepEqual(config.app.security,base.app.security);
 assert.deepEqual(config.app.security,pkg.app.security);
 assert.deepEqual(config.bundle.icon,base.bundle.icon);
 for(const key of ['category','shortDescription','longDescription'])assert.equal(config.bundle[key],base.bundle[key],key);
 assert.deepEqual(config.bundle.macOS,{minimumSystemVersion:'13.5'});
 assert.deepEqual(config.bundle.macOS,base.bundle.macOS);
 for(const key of ['active','targets','resources'])assert.deepEqual(config.bundle[key],pkg.bundle[key],key);
 for(const key of ['beforeBuildCommand','frontendDist'])assert.equal(config.build[key],pkg.build[key],key);
 const capability=await json(join(tauri,'capabilities','default.json'));
 assert.deepEqual(capability.windows,config.app.windows.map(window=>window.label));
});

test('development and review configurations keep their own identities',async()=>{
 const names=(await readdir(tauri)).filter(name=>/^tauri.*\.conf\.json$/.test(name)).sort();
 assert.ok(names.includes('tauri.public.conf.json'));
 for(const name of names){
  const config=await json(join(tauri,name));
  if(name==='tauri.public.conf.json')continue;
  assert.notEqual(config.identifier,PUBLIC.identifier,name);
 }
 // Development configurations must not masquerade as the public configuration.
 const development=names.filter(name=>['tauri.conf.json','tauri.v2.conf.json'].includes(name));
 assert.ok(development.includes('tauri.conf.json'));
 for(const name of development){
  const config=await json(join(tauri,name));
  assert.equal(config.identifier,DEVELOPMENT,name);
  assert.equal(config.productName,'OMD v2 Development',name);
  assert.equal(config.app.windows[0].title,'OMD v2 Development',name);
 }
 const base=await json(join(tauri,'tauri.conf.json')),pkg=await json(join(tauri,'tauri.v2.package.conf.json'));
 assert.equal(pkg.identifier,DEVELOPMENT);
 assert.equal(base.bundle.active,false);
 const v=await versions();
 // Building the development package or the base config with the public entry is refused.
 assert.throws(()=>checkPublicConfig(mergePatch(base,pkg),v),/identifier labs\.northwolf\.omd, not labs\.northwolf\.omd-v2-development/);
 assert.throws(()=>checkPublicConfig(base,v),/identifier labs\.northwolf\.omd/);
});

test('merge semantics and public configuration mistakes are refused',async()=>{
 const config=await publicConfig(),v=await versions();
 const partial=mergePatch(config,{app:{windows:[{label:'main',title:'OMD'}]}});
 assert.equal(partial.app.windows[0].width,undefined,'a partial window array drops geometry');
 assert.throws(()=>checkPublicConfig(partial,v),/reviewed main window/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{app:{windows:[...config.app.windows,{label:'other'}]}}),v),/reviewed main window/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{app:{windows:[{...config.app.windows[0],devtools:true}]}}),v),/reviewed main window/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{app:{security:{csp:null}}}),v),/content security policy/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{macOS:null}}),v),/macOS 13\.5/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{macOS:{minimumSystemVersion:'11.0'}}}),v),/macOS 13\.5/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{macOS:{signingIdentity:'-'}}}),v),/separate reviewed step/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{active:false}}),v),/active \.app/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{resources:['resources/v2/**/*','extra']}}),v),/active \.app/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{productName:'OMD Development'}),v),/product name OMD/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{version:'0.2.2'}),v),/must equal package\.json/);
 assert.throws(()=>checkPublicConfig(config,{...v,cargo:'0.3.0'}),/Cargo\.toml 0\.3\.0/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{build:{frontendDist:'../dist'}}),v),/dist-v2/);
 // Without a publisher Tauri derives "northwolf" from the identifier for Windows.
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{publisher:null}}),v),/publisher North Wolf Labs LLC and copyright © 2026 North Wolf Labs LLC/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{publisher:'northwolf'}}),v),/publisher North Wolf Labs LLC/);
 assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{copyright:null}}),v),/copyright © 2026 North Wolf Labs LLC/);
});

const releaseInventory=()=>({platform:'darwin',arch:'arm64',build_host:{platform:'darwin',arch:'arm64'},worker_profile:'release',plugins:{mode:'public',publishable:true,packages:[]},staging_mode:'release',release_accepted:false,materials:{schema:'omd-materials-v1',coverage_validated:true,release_accepted:false,binding:'two-phase',deferred:['desktop-rust','frontend']},files:[]});
const releaseMaterials=()=>({schema:'omd-materials-v1',target:'darwin-arm64',version:'0.2.3'});

test('Windows and Linux use the public identity and the same strict release staging gates',async()=>{
 for(const [platform,triple,target] of [['win32','x86_64-pc-windows-msvc','win32-x64'],['linux','x86_64-unknown-linux-gnu','linux-x64']]){
  const config=await publicConfig(desktop,platform),v={...await versions(),platform};
  checkPublicConfig(config,v);
  assert.equal(config.identifier,PUBLIC.identifier);
  assert.equal(config.bundle.publisher,PUBLIC.publisher);assert.equal(config.bundle.copyright,PUBLIC.copyright);
  const inventory=releaseInventory();inventory.platform=platform;inventory.arch='x64';
  assert.equal(checkPublicStaging(inventory,{...releaseMaterials(),target},{triple,version:config.version}),target);
  assert.throws(()=>checkPublicStaging({...inventory,staging_mode:'development'},{...releaseMaterials(),target},{triple,version:config.version}),/release-staged/);
  if(platform==='win32'){
   assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{windows:{allowDowngrades:true}}}),v),/downgrade protection/);
   assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{windows:{nsis:{installMode:'perMachine'}}}}),v),/per-user/);
   assert.throws(()=>checkPublicConfig(mergePatch(config,{bundle:{windows:{webviewInstallMode:{type:'fixedRuntime',path:'./runtime'}}}}),v),/fixedRuntime is not supported/);
  }
 }
});

test('the Windows installer hooks read the keys Tauri writes for the public product',async()=>{
 // Tauri CLI 2.11.4's NSIS template: UNINSTKEY is ...\Uninstall\${PRODUCTNAME}; only
 // MANUKEY (Software\${MANUFACTURER}, the install-folder key) follows bundle.publisher.
 // The hooks must read the installed version through ${UNINSTKEY} under HKCU (per-user
 // install), never a publisher-named key such as the old Software\northwolf.
 const hooks=await readFile(join(tauri,'windows-hooks.nsh'),'utf8'),config=await publicConfig(desktop,'win32');
 const reads=[...hooks.matchAll(/^\s*ReadReg\w+\s+\S+\s+(\S+)\s+"([^"]+)"/gm)].map(match=>[match[1],match[2]]);
 assert.deepEqual(reads,[['HKCU','${UNINSTKEY}']]);
 assert.doesNotMatch(hooks,/MANUKEY|MANUPRODUCTKEY|Software\\\\|northwolf\\\\|North Wolf Labs/);
 assert.equal(config.productName,'OMD');assert.equal(config.bundle.windows.nsis.installMode,'currentUser');
 assert.equal(config.bundle.publisher,'North Wolf Labs LLC');
});

test('public builds accept only release-staged public resources with two-phase materials',()=>{
 const options={triple:'aarch64-apple-darwin',version:'0.2.3'};
 assert.equal(checkPublicStaging(releaseInventory(),releaseMaterials(),options),'darwin-arm64');
 const refused=[
  [inventory=>{inventory.staging_mode='development';delete inventory.materials;},/release-staged resources, not development staging/],
  [inventory=>{inventory.plugins={mode:'private',publishable:false,packages:[]};},/public plugin staging/],
  [inventory=>{inventory.plugins.publishable=false;},/public plugin staging/],
  [inventory=>{inventory.worker_profile='debug';},/release worker/],
  [inventory=>{inventory.arch='x64';},/staged for darwin-x64, not darwin-arm64/],
  [inventory=>{inventory.release_accepted=true;},/release_accepted: false/],
  [inventory=>{delete inventory.materials.binding;delete inventory.materials.deferred;},/two-phase/],
  [inventory=>{inventory.materials.binding='single-phase';},/two-phase/],
  [inventory=>{inventory.materials.deferred=['desktop-rust','frontend','browser'];},/two-phase/],
  [inventory=>{inventory.materials.coverage_validated=false;},/two-phase/],
 ];
 for(const [mutate,message] of refused){const inventory=releaseInventory();mutate(inventory);assert.throws(()=>checkPublicStaging(inventory,releaseMaterials(),options),message);}
 assert.throws(()=>checkPublicStaging(releaseInventory(),{...releaseMaterials(),version:'0.1.0'},options),/version 0\.2\.3/);
 assert.throws(()=>checkPublicStaging(releaseInventory(),{...releaseMaterials(),target:'darwin-x64'},options),/darwin-arm64 version/);
 assert.throws(()=>checkPublicStaging(releaseInventory(),null,options),/staged materials/);
 assert.throws(()=>checkPublicStaging(releaseInventory(),releaseMaterials(),{...options,triple:'x86_64-pc-windows-msvc'}),/staged for darwin-arm64, not win32-x64/);
});

test('built bundle metadata must carry the public identity',async()=>{
 const config=await publicConfig();
 const info={CFBundlePackageType:'APPL',CFBundleIdentifier:'labs.northwolf.omd',CFBundleName:'OMD',CFBundleDisplayName:'OMD',CFBundleShortVersionString:'0.2.3',CFBundleVersion:'0.2.3',CFBundleExecutable:'open-media-downloader-desktop',CFBundleIconFile:'icon.icns',LSMinimumSystemVersion:'13.5',NSHumanReadableCopyright:'© 2026 North Wolf Labs LLC'};
 assert.deepEqual(checkBundleInfo(info,config,'open-media-downloader-desktop'),info);
 assert.throws(()=>checkBundleInfo({...info,CFBundleIdentifier:DEVELOPMENT},config,'open-media-downloader-desktop'),/CFBundleIdentifier is "labs\.northwolf\.omd-v2-development"/);
 assert.throws(()=>checkBundleInfo({...info,LSMinimumSystemVersion:'11.0'},config,'open-media-downloader-desktop'),/LSMinimumSystemVersion/);
 assert.throws(()=>checkBundleInfo({...info,CFBundleName:'OMD v2 Development',CFBundleDisplayName:'OMD v2 Development'},config,'open-media-downloader-desktop'),/CFBundleName.*CFBundleDisplayName/);
 const {NSHumanReadableCopyright:_,...uncredited}=info;
 assert.throws(()=>checkBundleInfo(uncredited,config,'open-media-downloader-desktop'),/NSHumanReadableCopyright is undefined, expected "© 2026 North Wolf Labs LLC"/);
});

// A minimal copy of the desktop layout so the CLI can be exercised without building.
async function cliFixture(){
 const root=await mkdtemp(join(tmpdir(),'omd-public-build-'));
 const copy=async relative=>{await mkdir(dirname(join(root,'desktop',relative)),{recursive:true});await copyFile(join(desktop,relative),join(root,'desktop',relative));};
 for(const relative of ['scripts/build-public.mjs','scripts/plugin-policy.mjs','scripts/materials-contract.mjs','packaging/public-plugins.json','package.json','src-tauri/Cargo.toml','src-tauri/tauri.conf.json','src-tauri/tauri.public.conf.json'])await copy(relative);
 await cp(await realpath(join(desktop,'node_modules/smol-toml')),join(root,'desktop/node_modules/smol-toml'),{recursive:true});
 const exe=process.platform==='win32'?'.exe':'',bin=join(root,'bin'),browser=join(root,'browser');
 await mkdir(bin);await mkdir(browser);
 for(const name of ['omd-engine','omd-plugin-worker-v2','omd-helper-guardian','omd-notify','omd-signin','omd'])await writeFile(join(bin,name+exe),name==='omd-plugin-worker-v2'?'OMD_WORKER_PROFILE=release':name);
 // macOS staging takes the engine's sign-in window app bundle (with this project's icon).
 const signIn=join(bin,'OMD Sign-In.app/Contents');await mkdir(join(signIn,'MacOS'),{recursive:true});await mkdir(join(signIn,'Resources'));
 await writeFile(join(signIn,'Info.plist'),'<plist version="1.0"><dict/></plist>\n');await writeFile(join(signIn,'MacOS/omd-signin'),'omd-signin',{mode:0o755});
 await copyFile(join(desktop,'src-tauri/icons/icon.icns'),join(signIn,'Resources/AppIcon.icns'));
 const digest=text=>createHash('sha256').update(text).digest('hex');
 await writeFile(join(root,'tool'),'fixture tool');const tool={path:'tool',version:'fixture',sha256:digest('fixture tool')};
 await writeFile(join(root,'tools.json'),JSON.stringify(Object.fromEntries(['node','yt_dlp','ffmpeg','ffprobe'].map(name=>[name,tool]))));
 for(const name of ['adapter','browser'])await writeFile(join(browser,name),name);
 await writeFile(join(root,'browser.json'),JSON.stringify({root:'browser',node:tool,browser:'browser',adapter:'adapter',files:Object.fromEntries(['adapter','browser'].map(name=>[name,{sha256:digest(name),bytes:name.length}]))}));
 const staged=spawnSync(process.execPath,[join(desktop,'scripts/stage-v2.mjs'),'--engine-bin',bin,'--tools',join(root,'tools.json'),'--browser-tools',join(root,'browser.json'),'--output',join(root,'desktop/src-tauri/resources/v2')],{encoding:'utf8'});
 assert.equal(staged.status,0,staged.stderr);
 const overrides=new Set(rustOverrides(process.env));
 const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='TAURI_CONFIG'&&!key.startsWith('APPLE_')&&!key.startsWith('TAURI_SIGNING')&&!overrides.has(key)));
 await mkdir(join(root,'cargo-home'));
 const run=(env={})=>spawnSync(process.execPath,[join(root,'desktop/scripts/build-public.mjs'),'--check'],{encoding:'utf8',env:{...clean,CARGO_HOME:join(root,'cargo-home'),...env}});
 return {root,run,cleanup:()=>rm(root,{recursive:true,force:true})};
}

test('the public build entry refuses development staging, implicit config and signing inputs before building',async()=>{
 const f=await cliFixture();
 try{
  let result=f.run();
  assert.notEqual(result.status,0);assert.match(result.stderr,/release-staged resources, not development staging/);
  result=f.run({TAURI_CONFIG:'{"identifier":"labs.northwolf.omd-v2-development"}'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/TAURI_CONFIG would be merged/);
  result=f.run({APPLE_SIGNING_IDENTITY:'Developer ID Application: Example (TEAMID1234)'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/separate reviewed steps.*APPLE_SIGNING_IDENTITY/);
  result=f.run({APPLE_ID:'operator@example.invalid'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/unset APPLE_ID/);
  // An ad-hoc rehearsal identity is allowed through to the staging check.
  result=f.run({APPLE_SIGNING_IDENTITY:'-'});
  assert.match(result.stderr,/release-staged resources/);
  const overlay=join(f.root,'desktop/src-tauri/tauri.public.conf.json'),original=await readFile(overlay,'utf8');
  await writeFile(overlay,original.replace('"labs.northwolf.omd"',`"${DEVELOPMENT}"`));
  result=f.run();
  assert.notEqual(result.status,0);assert.match(result.stderr,/identifier labs\.northwolf\.omd, not labs\.northwolf\.omd-v2-development/);
  await writeFile(overlay,original);
  await writeFile(join(f.root,'desktop/src-tauri/tauri.macos.conf.json'),'{"identifier":"labs.northwolf.omd-v2-development"}');
  result=f.run();
  assert.notEqual(result.status,0);assert.match(result.stderr,/tauri\.macos\.conf\.json would be merged implicitly/);
 }finally{await f.cleanup();}
});

test('the public build entry refuses ambient Rust flags, compilers, wrappers and Cargo rustflags',async()=>{
 const f=await cliFixture();
 try{
  for(const [name,value] of [['RUSTFLAGS','-Cdebuginfo=2'],['CARGO_ENCODED_RUSTFLAGS',''],['CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS','-Cdebuginfo=2'],['RUSTC_WRAPPER','sccache'],['CARGO_BUILD_RUSTC','/opt/rustc']]){
   const result=f.run({[name]:value});
   assert.notEqual(result.status,0,name);assert.match(result.stderr,new RegExp(`sets its own Rust path remapping; unset ${name}`),name);
  }
  // The reviewed proc-macro strip override is not a path setting and stays allowed.
  let result=f.run({CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP:'none'});
  assert.match(result.stderr,/release-staged resources/);
  const config=join(f.root,'desktop/src-tauri/.cargo/config.toml');
  await mkdir(dirname(config));await writeFile(config,'[build]\nrustflags = ["-Cdebuginfo=2"]\n');
  result=f.run();
  assert.notEqual(result.status,0);assert.match(result.stderr,/Cargo configuration would replace or bypass the public path remapping/);
  await writeFile(config,'[net]\noffline = true\n');
  result=f.run();
  assert.match(result.stderr,/release-staged resources/);
  await writeFile(join(f.root,'cargo-home/config.toml'),'[build]\nrustc-wrapper = "sccache"\n');
  result=f.run();
  assert.notEqual(result.status,0);assert.match(result.stderr,/cargo-home[\\/]config\.toml/);
 }finally{await f.cleanup();}
});

const COMMIT='254b59607d4417e9dffbc307138ae5c86280fe4c';
// Fixture roots under the filesystem root, so the same names are absolute on every OS.
const BASE=resolve(sep);
test('public Rust path remapping maps every builder root, most specific last, without shell quoting',()=>{
 const desktopRoot=join(BASE,'b','omd = desktop'),target=join(desktopRoot,'src-tauri','target'),cargoHome=join(BASE,'c','cargo home'),sysroot=join(BASE,'h','user','.rustup','toolchains','stable');
 // A canonical alias (like /private/var for /var) maps to the same logical prefix.
 const alias=join(BASE,'private','b','omd = desktop');
 const realpath=host=>{if(host===desktopRoot)return alias;if(host.endsWith(join('src','rust')))throw Object.assign(new Error('absent'),{code:'ENOENT'});return host;};
 const remap=publicRustPaths({desktop:desktopRoot,targetDir:target,cargoHome,toolchain:{sysroot,commit:COMMIT},realpath});
 assert.deepEqual(remap.map(entry=>[entry.role,entry.host,entry.logical,entry.alias]),[
  ['cargo-home',cargoHome,LOGICAL.cargoHome,false],
  ['desktop',desktopRoot,LOGICAL.desktop,false],
  ['desktop',alias,LOGICAL.desktop,true],
  ['target',target,LOGICAL.target,false],
  ['toolchain',sysroot,LOGICAL.toolchain,false],
  ['rust-src',join(sysroot,'lib','rustlib','src','rust'),`/rustc/${COMMIT}`,false],
 ]);
 const args=encodeRustflags(remap).split('\x1f');
 assert.equal(args.length,remap.length);
 for(const [i,arg] of args.entries()){
  assert.ok(arg.startsWith('--remap-path-prefix='));
  // rustc splits at the last '=', so hosts may contain '=' and spaces stay inside one argument.
  const value=arg.slice('--remap-path-prefix='.length),split=value.lastIndexOf('=');
  assert.deepEqual([value.slice(0,split),value.slice(split+1)],[remap[i].host,remap[i].logical]);
 }
 // rustc applies the last matching entry: the target directory wins inside the desktop root.
 const host=join(target,'release','build','x','out','gen.rs');
 const winner=remap.filter(entry=>host.startsWith(entry.host+sep)).at(-1);
 assert.equal(winner.role,'target');
});

test('ambiguous, relative or unencodable remapping roots are refused',()=>{
 const realpath=host=>host,same=join(BASE,'same'),c=join(BASE,'c');
 assert.throws(()=>rustPathRemap([{role:'desktop',host:same,logical:'/omd/desktop'},{role:'target',host:same,logical:'/omd/target'}],{realpath}),/cannot be both desktop and target/);
 assert.deepEqual(rustPathRemap([{role:'a',host:same+sep,logical:'/x'},{role:'b',host:same,logical:'/x'}],{realpath}).length,1);
 assert.throws(()=>rustPathRemap([{role:'target',host:join('relative','target'),logical:'/omd/target'}],{realpath}),/target path must be absolute/);
 assert.throws(()=>rustPathRemap([{role:'cargo-home',host:join(c,'a\x1fb'),logical:'/cargo'}],{realpath}),/control character/);
 assert.throws(()=>rustPathRemap([{role:'cargo-home',host:c,logical:'/cargo=x'}],{realpath}),/Invalid logical prefix/);
 assert.throws(()=>rustPathRemap([{role:'cargo-home',host:c,logical:'relative'}],{realpath}),/Invalid logical prefix/);
});

test('ambient override names and Cargo configuration are classified exactly',async()=>{
 assert.deepEqual(rustOverrides({RUSTFLAGS:'',CARGO_ENCODED_RUSTFLAGS:'x',CARGO_BUILD_RUSTFLAGS:'',CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS:'',CARGO_PROFILE_RELEASE_RUSTFLAGS:'',
  RUSTC:'rustc',CARGO_BUILD_RUSTC:'rustc',RUSTC_WRAPPER:'',RUSTC_WORKSPACE_WRAPPER:'',CARGO_BUILD_RUSTC_WRAPPER:'',CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER:'',
  CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP:'none',CARGO_TARGET_DIR:'/t',CARGO_HOME:'/c',RUSTUP_TOOLCHAIN:'1.93.0',RUSTDOCFLAGS:'',CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER:'cc'}),
  ['CARGO_BUILD_RUSTC','CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER','CARGO_BUILD_RUSTC_WRAPPER','CARGO_BUILD_RUSTFLAGS','CARGO_ENCODED_RUSTFLAGS','CARGO_PROFILE_RELEASE_RUSTFLAGS','CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS','RUSTC','RUSTC_WORKSPACE_WRAPPER','RUSTC_WRAPPER','RUSTFLAGS']);
 const root=await mkdtemp(join(tmpdir(),'omd-cargo-config-'));
 try{
  const start=join(root,'a','b');await mkdir(join(start,'.cargo'),{recursive:true});await mkdir(join(root,'a','.cargo'));await mkdir(join(root,'home'));
  const cases=[['[target.aarch64-apple-darwin]\nlinker = "cc"\n',false],['[build]\nrustflags = ["-Cdebuginfo=2"]\n',true],['build.rustc-workspace-wrapper = "x"\n',true],
   ['[target.\'cfg(unix)\']\n"rustflags" = []\n',true],['[build]\nrustc = "/opt/rustc"\n',true],['[build]\nrustdocflags = []\njobs = 4\n',false]];
  for(const [text,overrides] of cases){
   await writeFile(join(start,'.cargo','config.toml'),text);
   const found=await cargoConfigFiles(start,join(root,'home'));
   assert.deepEqual(found,[{file:join(start,'.cargo','config.toml'),overrides}],text);
  }
  await writeFile(join(root,'a','.cargo','config'),'[build]\nrustflags = []\n');await writeFile(join(root,'home','config.toml'),'[net]\noffline = true\n');
  assert.deepEqual((await cargoConfigFiles(start,join(root,'home'))).map(found=>[found.file,found.overrides]),
   [[join(start,'.cargo','config.toml'),false],[join(root,'a','.cargo','config'),true],[join(root,'home','config.toml'),false]]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('the post-build scan reports exact builder roots and the home directory',()=>{
 const remap=[{role:'cargo-home',host:'/c/cargo home',logical:'/cargo'},{role:'desktop',host:'/b/desktop',logical:'/omd/desktop'}];
 const bytes=Buffer.from('x/c/cargo home/registry/a.rs\0/cargo/registry/b.rs\0/c/cargo home/registry/c.rs\0/omd/desktop/src/lib.rs\0/Users/someone/.rustup/x');
 assert.deepEqual(hostPathLeaks(bytes,remap,'/Users/other'),[{host:'/c/cargo home',count:2}]);
 assert.deepEqual(hostPathLeaks(bytes,remap,'/Users/someone'),[{host:'/c/cargo home',count:2},{host:'/Users/someone',count:1}]);
 assert.deepEqual(hostPathLeaks(Buffer.from('/cargo/registry/b.rs /omd/desktop/src/lib.rs'),remap,'/Users/someone'),[]);
});

// This probe is macOS-specific: it compiles a small program with the active rustc and
// scans the Mach-O link output. Public builds also target Windows and Linux; their
// PE/ELF remapping is not covered by this probe (build-public.mjs scans those
// executables after building instead).
// Like Cargo's release profile it strips debuginfo: an unstripped macOS link keeps the
// linker's debug map of prebuilt standard-library objects, which remapping cannot change.
test('remapped rustc output keeps no builder path for a root with spaces',{skip:process.platform!=='darwin'&&'Mach-O-specific probe; Windows/Linux remapping is not covered here'},async()=>{
 const root=await mkdtemp(join(tmpdir(),'omd remap probe = '));
 try{
  await mkdir(join(root,'src'));
  await writeFile(join(root,'src','dep.rs'),'use std::collections::BTreeMap;\n#[inline(never)]\npub fn pick<T: Clone + Ord>(v: &[T], i: usize) -> T { let mut m = BTreeMap::new(); for (k, x) in v.iter().enumerate() { m.insert(x.clone(), k); } let _ = m.len(); v[i].clone() }\npub fn chan() -> u8 { let (s, r) = std::sync::mpsc::channel::<u8>(); s.send(1).unwrap(); r.recv().unwrap() }\n');
  await writeFile(join(root,'src','main.rs'),'fn main() { let a: Vec<String> = std::env::args().collect(); println!("{} {}", dep::pick(&a, a.len() + 1), dep::chan()); }\n');
  const toolchain=rustToolchain(root,process.env);
  const remap=publicRustPaths({desktop:root,targetDir:join(root,'target'),cargoHome:join(root,'cargo home'),toolchain});
  const build=async(name,flags)=>{
   const out=join(root,'target',name);await mkdir(out,{recursive:true});
   for(const args of [['--crate-type','rlib','--crate-name','dep',join(root,'src','dep.rs'),'--out-dir',out],[join(root,'src','main.rs'),'--extern',`dep=${join(out,'libdep.rlib')}`,'-o',join(out,'probe')]]){
    const result=spawnSync('rustc',['--edition','2021','-O','-C','strip=debuginfo',...args,...flags],{cwd:root,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
   }
   return readFile(join(out,'probe'));
  };
  const plain=await build('plain',[]),remapped=await build('remapped',encodeRustflags(remap).split('\x1f'));
  assert.ok(plain.includes(Buffer.from(join(root,'src','dep.rs'))),'control: unmapped output embeds the builder root');
  assert.deepEqual(hostPathLeaks(remapped,remap,homedir()),[]);
  assert.ok(remapped.includes(Buffer.from(`${LOGICAL.desktop}/src/dep.rs`)));
  const rustSrc=join(toolchain.sysroot,'lib','rustlib','src','rust');
  if(existsSync(rustSrc)){
   // With rust-src installed, rustc embeds its local copy for generic library code.
   assert.ok(plain.includes(Buffer.from(rustSrc)),'control: unmapped output embeds the local rust-src path');
   assert.ok(remapped.includes(Buffer.from(`/rustc/${toolchain.commit}/library/`)));
  }
 }finally{await rm(root,{recursive:true,force:true});}
});


test('Cargo TOML escaped keys are classified semantically, without matching comments',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omd-config-review-'));
 try{
  await mkdir(join(root,'.cargo'));const home=join(root,'cargo-home');await mkdir(home);
  for(const key of ['rustc','rustflags','rustc-wrapper','rustc-workspace-wrapper']){
   const encoded='"'+[...key].map(c=>String.fromCharCode(92)+'u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('')+'"';
   await writeFile(join(root,'.cargo/config.toml'),'[build]'+String.fromCharCode(10)+encoded+' = "unused"');
   assert.equal((await cargoConfigFiles(root,home))[0].overrides,true,key);
  }
  await writeFile(join(root,'.cargo/config.toml'),'# rustc = "example"\n[env]\nNOTE = "rustflags = example"\n');
  assert.equal((await cargoConfigFiles(root,home))[0].overrides,false);
  await writeFile(join(root,'.cargo/config.toml'),'[broken');
  await assert.rejects(cargoConfigFiles(root,home),/Cannot parse Cargo configuration/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Cargo environment is absolute relative to src-tauri, independent of caller cwd',async()=>{
 const root=await mkdtemp(join(tmpdir(),'omd-target-review-'));
 try{
  const tauriDir=join(root,'src-tauri');await mkdir(join(tauriDir,'.cargo'),{recursive:true});await mkdir(join(tauriDir,'src'));
  await writeFile(join(tauriDir,'Cargo.toml'),'[package]\nname="target-probe"\nversion="0.1.0"\nedition="2021"\n');
  await writeFile(join(tauriDir,'src/main.rs'),'fn main() {}');
  await writeFile(join(tauriDir,'.cargo/config.toml'),'[build]\ntarget-dir="configured-target"\n');
  for(const values of [{CARGO_HOME:'../cargo home'}, {CARGO_HOME:'../cargo home',CARGO_TARGET_DIR:'../relative target'}]){
   const env=publicCargoEnvironment({...process.env,...values},tauriDir);
   assert.equal(env.CARGO_HOME,resolve(tauriDir,values.CARGO_HOME));
   assert.equal(env.CARGO_TARGET_DIR,resolve(tauriDir,values.CARGO_TARGET_DIR||'target'));
   const result=spawnSync('cargo',['metadata','--offline','--no-deps','--format-version','1'],{cwd:tauriDir,env,encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).target_directory,env.CARGO_TARGET_DIR);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
