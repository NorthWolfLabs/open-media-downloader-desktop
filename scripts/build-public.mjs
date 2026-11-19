// Public reference-app build entry. It applies the reviewed public identity in
// src-tauri/tauri.public.conf.json over the development base configuration, accepts
// only release-staged public resources, remaps builder paths in the Rust build and
// checks the built bundle's metadata.
// Signing, notarization and release acceptance remain separate steps.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parse as parseToml} from 'smol-toml';
import {loadPublicPolicy,checkPublicResources} from './plugin-policy.mjs';

const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Without publisher Tauri derives it from the identifier ("northwolf"): it is the
// Windows uninstall entry's Publisher and the executable's CompanyName. Copyright is
// the executable's LegalCopyright and macOS NSHumanReadableCopyright.
export const PUBLIC=Object.freeze({productName:'OMD',identifier:'labs.northwolf.omd',publisher:'North Wolf Labs LLC',copyright:'© 2026 North Wolf Labs LLC',minimumSystemVersion:'13.5',frontendDist:'../dist-v2',resources:['resources/v2/']});
const TARGETS={'aarch64-apple-darwin':'darwin-arm64','x86_64-apple-darwin':'darwin-x64','x86_64-pc-windows-msvc':'win32-x64','x86_64-unknown-linux-gnu':'linux-x64'};
// Tauri's own signing and notarization would bypass scripts/sign-macos.py.
const SIGNING_ENV=['APPLE_CERTIFICATE','APPLE_CERTIFICATE_PASSWORD','APPLE_ID','APPLE_PASSWORD','APPLE_TEAM_ID','APPLE_API_KEY','APPLE_API_ISSUER','APPLE_API_KEY_PATH','APPLE_PROVIDER_SHORT_NAME','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD'];
const need=(ok,message)=>{if(!ok)throw new Error(message);};

// RFC 7396 merge patch, as Tauri applies --config files: objects merge by key,
// null removes a key and arrays (such as app.windows) are replaced whole.
export function mergePatch(target,patch){
 if(patch===null||typeof patch!=='object'||Array.isArray(patch))return structuredClone(patch);
 const result=target!==null&&typeof target==='object'&&!Array.isArray(target)?structuredClone(target):{};
 for(const [key,value] of Object.entries(patch)){if(value===null)delete result[key];else result[key]=mergePatch(result[key],value);}
 return result;
}

export function cargoPackage(text){
 const result={};let inside=false;
 for(const line of text.split(/\r?\n/)){
  const header=line.match(/^\s*\[([^\]]+)\]\s*$/);
  if(header){inside=header[1].trim()==='package';continue;}
  const field=inside&&line.match(/^\s*(name|version)\s*=\s*"([^"]*)"\s*$/);
  if(field)result[field[1]]=field[2];
 }
 return result;
}

export async function publicConfig(root=desktop,platform='darwin'){
 const dir=path.join(root,'src-tauri');
 // Tauri would merge a platform file implicitly, outside the reviewed overlay.
 for(const platformName of ['macos','windows','linux'])for(const name of [`tauri.${platformName}.conf.json`,`tauri.${platformName}.conf.json5`,`Tauri.${platformName}.toml`])if(await lstat(path.join(dir,name)).catch(()=>null))throw new Error(`${name} would be merged implicitly into the public build; review its values into the explicit public configuration instead`);
 const base=JSON.parse(await readFile(path.join(dir,'tauri.conf.json'),'utf8'));
 let config=mergePatch(base,JSON.parse(await readFile(path.join(dir,'tauri.public.conf.json'),'utf8')));
 if(platform==='win32')config=mergePatch(config,JSON.parse(await readFile(path.join(dir,'tauri.public.windows.conf.json'),'utf8')));
 else if(platform==='linux')config=mergePatch(config,JSON.parse(await readFile(path.join(dir,'tauri.v2.linux.conf.json'),'utf8')));
 else need(platform==='darwin','Unsupported public desktop platform');
 return config;
}

export function checkPublicConfig(config,{npm,cargo,platform='darwin'}){
 need(config.identifier===PUBLIC.identifier,`The public build must use identifier ${PUBLIC.identifier}, not ${config.identifier}`);
 need(config.productName===PUBLIC.productName,`The public build must use product name ${PUBLIC.productName}, not ${config.productName}`);
 need(typeof config.version==='string'&&config.version===npm&&config.version===cargo,`The public version ${config.version} must equal package.json ${npm} and Cargo.toml ${cargo}`);
 need(config.build?.frontendDist===PUBLIC.frontendDist,`The public build must embed ${PUBLIC.frontendDist}`);
 const windows=config.app?.windows;
 need(Array.isArray(windows)&&windows.length===1&&windows[0]?.label==='main'&&windows[0].title===PUBLIC.productName&&windows[0].url==='v2.html'&&windows[0].devtools===false,'The public build needs exactly the reviewed main window');
 need(config.app?.security?.csp!==null&&typeof config.app?.security?.csp==='object','The public build needs the reviewed content security policy');
 const bundle=config.bundle??{};
 const targets=platform==='win32'?['nsis']:platform==='linux'?['deb']:['app'];
 need(bundle.active===true&&isDeepStrictEqual(bundle.targets,targets)&&isDeepStrictEqual(bundle.resources,PUBLIC.resources),platform==='darwin'?'The public bundle must be an active .app bundling resources/v2/':'The public bundle must use the reviewed platform target and resources/v2/');
 need(bundle.publisher===PUBLIC.publisher&&bundle.copyright===PUBLIC.copyright,`The public bundle must name publisher ${PUBLIC.publisher} and copyright ${PUBLIC.copyright}`);
 // The desktop checks for the Evergreen WebView2 Runtime before Tauri would set up a
 // fixed-version one (src-tauri/src/webview_runtime.rs), so that mode is not supported.
 if(platform==='win32')need(bundle.windows?.webviewInstallMode?.type!=='fixedRuntime','Windows releases use the Evergreen WebView2 Runtime; fixedRuntime is not supported by the startup check');
 if(platform==='win32')need(bundle.windows?.nsis?.installMode==='currentUser'&&bundle.windows?.allowDowngrades===false&&bundle.windows?.nsis?.installerHooks==='windows-hooks.nsh','Windows releases need stable per-user installation, shutdown hooks and downgrade protection');
 need(bundle.macOS?.minimumSystemVersion===PUBLIC.minimumSystemVersion,`The public bundle must declare macOS ${PUBLIC.minimumSystemVersion}`);
 need(bundle.macOS?.signingIdentity===undefined&&bundle.macOS?.providerShortName===undefined,'Signing is a separate reviewed step; remove signing settings from the public configuration');
}

// Public packages use release staging with two-phase materials: the executable and
// its embedded frontend are bound after signing (engine bind-final-materials.py).
export function checkPublicStaging(inventory,materials,{triple,version}){
 const target=TARGETS[triple];
 need(target,`Unsupported public target ${triple}; use ${Object.keys(TARGETS).join(' or ')}`);
 need(inventory?.staging_mode==='release',`Public builds need release-staged resources, not ${inventory?.staging_mode} staging; restage with --staging-mode release --materials-binding two-phase`);
 need(inventory.release_accepted===false,'Staged resources must record release_accepted: false');
 need(`${inventory.platform}-${inventory.arch}`===target,`The resources were staged for ${inventory.platform}-${inventory.arch}, not ${target}`);
 need(inventory.plugins?.mode==='public'&&inventory.plugins.publishable===true,'Public builds need public plugin staging');
 need(inventory.worker_profile==='release','Public builds need the optimized release worker');
 const m=inventory.materials??{};
 need(m.schema==='omd-materials-v1'&&m.coverage_validated===true&&m.release_accepted===false&&m.binding==='two-phase'&&isDeepStrictEqual(m.deferred,['desktop-rust','frontend']),'Public builds need validated two-phase release materials that defer only desktop-rust and frontend');
 need(materials?.schema==='omd-materials-v1'&&materials.target===target&&materials.version===version,`The staged materials must describe ${target} version ${version}`);
 return target;
}

export function checkBundleInfo(info,config,executable){
 const expected={CFBundlePackageType:'APPL',CFBundleIdentifier:config.identifier,CFBundleName:config.productName,CFBundleDisplayName:config.productName,CFBundleShortVersionString:config.version,CFBundleVersion:config.version,CFBundleExecutable:executable,CFBundleIconFile:'icon.icns',LSMinimumSystemVersion:config.bundle.macOS.minimumSystemVersion,NSHumanReadableCopyright:config.bundle.copyright};
 const wrong=Object.entries(expected).filter(([key,value])=>info?.[key]!==value).map(([key,value])=>`${key} is ${JSON.stringify(info?.[key])}, expected ${JSON.stringify(value)}`);
 need(!wrong.length,`The built bundle does not carry the public metadata: ${wrong.join('; ')}`);
 return expected;
}

// rustc embeds source paths in panic locations, file!() and crate metadata. The public
// build maps each builder root to a stable logical prefix with --remap-path-prefix.
// Without the rust-src entry rustc 1.93 embeds the local rustup source for generic
// standard-library code. Development builds are not remapped.
export const LOGICAL={desktop:'/omd/desktop',target:'/omd/target',cargoHome:'/cargo',toolchain:'/rust/toolchain'};
// Ambient settings that would replace the remapping flags or the compiler that reads them.
const RUST_OVERRIDES=/^(RUSTFLAGS|CARGO_ENCODED_RUSTFLAGS|CARGO_BUILD_RUSTFLAGS|CARGO_TARGET_\w+_RUSTFLAGS|CARGO_PROFILE_\w+_RUSTFLAGS|RUSTC|CARGO_BUILD_RUSTC|RUSTC_WRAPPER|RUSTC_WORKSPACE_WRAPPER|CARGO_BUILD_RUSTC_WRAPPER|CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER)$/;
export function rustOverrides(env){return Object.keys(env).filter(name=>RUST_OVERRIDES.test(name)).sort();}

// Cargo reads .cargo/config files in every ancestor of its working directory and in
// CARGO_HOME. Their rustflags would be silently ignored next to CARGO_ENCODED_RUSTFLAGS,
// and a compiler or wrapper setting would bypass the flags; both are refused.
export function cargoConfigOverrides(text){
 const keys=new Set(['rustflags','rustc','rustc-wrapper','rustc-workspace-wrapper']);
 const walk=value=>value!==null&&typeof value==='object'&&Object.entries(value).some(([key,item])=>keys.has(key)||walk(item));
 return walk(parseToml(text));
}
export function publicCargoEnvironment(env,tauriDir){
 return {...env,CARGO_HOME:path.resolve(tauriDir,env.CARGO_HOME||path.join(homedir(),'.cargo')),
  CARGO_TARGET_DIR:path.resolve(tauriDir,env.CARGO_TARGET_DIR||'target')};
}
export async function cargoConfigFiles(start,cargoHome){
 const candidates=[];
 for(let dir=path.resolve(start);;dir=path.dirname(dir)){
  for(const name of ['config','config.toml'])candidates.push(path.join(dir,'.cargo',name));
  if(path.dirname(dir)===dir)break;
 }
 for(const name of ['config','config.toml'])candidates.push(path.join(cargoHome,name));
 const found=[];
 for(const file of candidates){
  const text=await readFile(file,'utf8').catch(error=>{if(['ENOENT','ENOTDIR'].includes(error.code))return null;throw error;});
  if(text!==null){let blocked;try{blocked=cargoConfigOverrides(text);}catch{throw new Error(`Cannot parse Cargo configuration ${file}; use valid TOML`);}found.push({file,overrides:blocked});}
 }
 return found;
}

// Ordered by host path length: rustc applies the last matching entry, so a nested
// root (such as the default target directory) overrides its parent. Canonical
// aliases of existing roots map to the same logical prefix.
export function rustPathRemap(roots,{realpath=realpathSync.native}={}){
 const byHost=new Map();
 for(const root of roots){
  need(typeof root.host==='string'&&path.isAbsolute(root.host),`The ${root.role} path must be absolute`);
  need(!/[\x00-\x1f]/.test(root.host),`The ${root.role} path contains a control character and cannot be passed to rustc`);
  need(/^\/[A-Za-z0-9._/-]+$/.test(root.logical)&&!root.logical.includes('..'),`Invalid logical prefix ${root.logical}`);
  const hosts=[path.resolve(root.host)];
  try{const canonical=realpath(hosts[0]);if(canonical!==hosts[0])hosts.push(canonical);}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const host of hosts){
   const prior=byHost.get(host);
   need(!prior||prior.logical===root.logical,`${host} cannot be both ${prior?.role} and ${root.role}`);
   if(!prior)byHost.set(host,{role:root.role,host,logical:root.logical,alias:host!==hosts[0]});
  }
 }
 return [...byHost.values()].sort((a,b)=>a.host.length-b.host.length||(a.host<b.host?-1:a.host>b.host?1:0));
}
// CARGO_ENCODED_RUSTFLAGS separates arguments with 0x1f, so paths keep their spaces
// and no shell parses them. rustc splits FROM=TO at the last '='.
export function encodeRustflags(remap){return remap.map(entry=>`--remap-path-prefix=${entry.host}=${entry.logical}`).join('\x1f');}

export function rustToolchain(cwd,env){
 const rustc=args=>{const result=spawnSync('rustc',args,{cwd,env,encoding:'utf8'});need(result.status===0,`rustc ${args.join(' ')} failed: ${result.stderr||result.error?.message}`);return result.stdout;};
 const verbose=rustc(['-vV']),sysroot=rustc(['--print','sysroot']).trim(),commit=verbose.match(/^commit-hash: ([0-9a-f]{40})$/m)?.[1];
 need(commit&&path.isAbsolute(sysroot),'rustc did not report its commit hash and sysroot');
 return {verbose,sysroot,commit};
}

export function publicRustPaths({desktop:root,targetDir,cargoHome,toolchain,realpath}){
 return rustPathRemap([
  {role:'desktop',host:root,logical:LOGICAL.desktop},
  {role:'target',host:targetDir,logical:LOGICAL.target},
  {role:'cargo-home',host:cargoHome,logical:LOGICAL.cargoHome},
  {role:'toolchain',host:toolchain.sysroot,logical:LOGICAL.toolchain},
  {role:'rust-src',host:path.join(toolchain.sysroot,'lib','rustlib','src','rust'),logical:`/rustc/${toolchain.commit}`},
 ],realpath?{realpath}:{});
}

// Exact host roots that must not remain in a public executable after remapping.
export function hostPathLeaks(bytes,remap,home=homedir()){
 const needles=[...new Set([...remap.map(entry=>entry.host),...(home&&home.length>1?[home]:[])])];
 const count=needle=>{let n=0;for(let at=bytes.indexOf(needle);at>=0;at=bytes.indexOf(needle,at+needle.length))n++;return n;};
 return needles.map(host=>({host,count:count(Buffer.from(host))})).filter(leak=>leak.count>0);
}

export async function main(args,env=process.env){
 const usage='Use: vp exec node scripts/build-public.mjs [--check] [--target aarch64-apple-darwin|x86_64-apple-darwin|x86_64-pc-windows-msvc|x86_64-unknown-linux-gnu] [--report /absolute/new-report.json]';
 const options={check:false,target:'aarch64-apple-darwin',report:null},seen=new Set;
 for(let i=0;i<args.length;i++){
  const key=args[i];need(!seen.has(key),usage);seen.add(key);
  if(key==='--check')options.check=true;
  else if(key==='--target'&&args[i+1])options.target=args[++i];
  else if(key==='--report'&&args[i+1])options.report=path.resolve(args[++i]);
  else throw new Error(usage);
 }
 need(!('TAURI_CONFIG' in env),'TAURI_CONFIG would be merged over the public configuration; unset it');
 const signing=SIGNING_ENV.filter(name=>name in env);
 if('APPLE_SIGNING_IDENTITY' in env&&env.APPLE_SIGNING_IDENTITY!=='-')signing.push('APPLE_SIGNING_IDENTITY');
 need(!signing.length,`Signing and notarization are separate reviewed steps (engine scripts/sign-macos.py); unset ${signing.join(', ')}`);
 const overrides=rustOverrides(env);
 need(!overrides.length,`The public build sets its own Rust path remapping; unset ${overrides.join(', ')}`);
 const tauriDir=path.join(desktop,'src-tauri');
 env=publicCargoEnvironment(env,tauriDir);
 const cargoHome=env.CARGO_HOME;
 const configs=await cargoConfigFiles(tauriDir,cargoHome),configOverrides=configs.filter(config=>config.overrides).map(config=>config.file);
 need(!configOverrides.length,`Cargo configuration would replace or bypass the public path remapping; remove rustflags and rustc settings from ${configOverrides.join(', ')}`);
 const platform=TARGETS[options.target]?.split('-')[0];
 need(platform,`Unsupported public target ${options.target}`);
 const config=await publicConfig(desktop,platform),cargo=cargoPackage(await readFile(path.join(desktop,'src-tauri','Cargo.toml'),'utf8'));
 checkPublicConfig(config,{npm:JSON.parse(await readFile(path.join(desktop,'package.json'),'utf8')).version,cargo:cargo.version,platform});
 const resources=path.join(desktop,'src-tauri','resources','v2');
 const inventoryBytes=await readFile(path.join(resources,'build-inventory.json')),inventory=JSON.parse(inventoryBytes);
 const materials=inventory?.staging_mode==='release'?JSON.parse(await readFile(path.join(resources,'third-party','materials-v1.json'),'utf8')):null;
 const target=checkPublicStaging(inventory,materials,{triple:options.target,version:config.version});
 const policy=await loadPublicPolicy(),staged=await checkPublicResources(resources,policy);
 const summary={schema:'omd-public-app-build-v1',status:'checked',release_accepted:false,config:'src-tauri/tauri.public.conf.json',
  identity:{productName:config.productName,identifier:config.identifier,version:config.version,minimumSystemVersion:config.bundle.macOS.minimumSystemVersion},
  target:options.target,resources:{target,files:staged.files,plugins:staged.plugins,staging_mode:'release',materials_binding:'two-phase',inventory_sha256:createHash('sha256').update(inventoryBytes).digest('hex')}};
 const targetDir=env.CARGO_TARGET_DIR;
 const toolchain=rustToolchain(tauriDir,env),remap=publicRustPaths({desktop,targetDir,cargoHome,toolchain});
 summary.rust_paths={rustc:toolchain.verbose,target_dir:targetDir,cargo_home:cargoHome,remap,cargo_config_files:configs.map(config=>config.file),
  limits:'Covers paths rustc derives from source locations under these roots; literal strings and prebuilt inputs are checked after the build, not rewritten.'};
 if(!options.check){
  need(process.platform===platform,'Build public installers on their target operating system');
  const bundleArgs=platform==='darwin'?['--bundles','app']:['--no-bundle'];
  const build=spawnSync(process.execPath,[path.join(desktop,'node_modules','@tauri-apps','cli','tauri.js'),'build','--config',JSON.stringify({...config,build:{...config.build,devUrl:null}}),'--features','v2',...bundleArgs,'--target',options.target,'--','--locked','--target-dir',targetDir],{cwd:desktop,env:{...env,CARGO_ENCODED_RUSTFLAGS:encodeRustflags(remap)+(platform==='win32'?'\u001f-C\u001ftarget-feature=+crt-static':'')},stdio:'inherit'});
  need(build.status===0,`tauri build failed (${build.status??build.signal})`);
  if(platform!=='darwin'){
   const executable=path.join(targetDir,options.target,'release',cargo.name+(platform==='win32'?'.exe':''));
   const leaks=hostPathLeaks(await readFile(executable),remap);
   need(!leaks.length,'The desktop executable still contains builder paths');
   Object.assign(summary,{status:'built_requires_installer_acceptance',executable,executable_sha256:createHash('sha256').update(await readFile(executable)).digest('hex')});
   summary.rust_paths.executable_builder_paths=0;
   summary.native_runtime=platform==='win32'?'static-msvc-crt':'platform-default';
   if(options.report)await writeFile(options.report,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
   return summary;
  }
  const app=path.join(targetDir,options.target,'release','bundle','macos',`${config.productName}.app`);
  const plist=spawnSync('/usr/bin/plutil',['-convert','json','-o','-',path.join(app,'Contents','Info.plist')],{encoding:'utf8'});
  need(plist.status===0,`Cannot read the built Info.plist: ${plist.stderr}`);
  summary.bundle=checkBundleInfo(JSON.parse(plist.stdout),config,cargo.name);
  need((await lstat(path.join(app,'Contents','MacOS',cargo.name))).isFile(),'The built bundle has no desktop executable');
  const leaks=hostPathLeaks(await readFile(path.join(app,'Contents','MacOS',cargo.name)),remap);
  need(!leaks.length,`The desktop executable still contains builder paths: ${leaks.map(leak=>`${leak.host} (${leak.count})`).join(', ')}`);
  summary.rust_paths.executable_builder_paths=0;
  const bundled=path.join(app,'Contents','Resources','resources','v2');
  need((await readFile(path.join(bundled,'build-inventory.json'))).equals(inventoryBytes),'The bundled resources differ from the checked staging inventory');
  await checkPublicResources(bundled,policy);
  Object.assign(summary,{status:'built',app});
 }
 if(options.report)await writeFile(options.report,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
 return summary;
}

if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url)))console.log(JSON.stringify(await main(process.argv.slice(2)),null,2));
