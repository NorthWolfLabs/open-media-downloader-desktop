// Full installed texts for actual production chunk inputs; no UI changes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
/** @param {string | Uint8Array} b */
const sha=b=>createHash('sha256').update(b).digest('hex');
/** @param {object} meta */
export function activeBuilder(meta, entry=process.argv[1]) {
 if(!meta||!('viteVersion' in meta)||typeof meta.viteVersion!=='string'||!meta.viteVersion||!entry)throw new Error('Cannot identify active Vite builder for virtual helper notices');
 const actual=fs.realpathSync(entry);
 let home=path.dirname(actual);
 while(home!==path.dirname(home)&&!fs.existsSync(path.join(home,'package.json')))home=path.dirname(home);
 const packageBytes=fs.readFileSync(path.join(home,'package.json')),pkg=JSON.parse(packageBytes.toString('utf8'));
 const matched=pkg.name==='vite'?pkg.version===meta.viteVersion:pkg.name==='@voidzero-dev/vite-plus-core'&&pkg.bundledVersions?.vite===meta.viteVersion;
 if(!matched)throw new Error('Active builder package does not match the running Vite version');
 const names=fs.readdirSync(home).filter(n=>/^(licen[cs]e|copying|notice)([._-]|$)/i.test(n)&&fs.statSync(path.join(home,n)).isFile()).sort();
 const texts=names.map(name=>({name,data:fs.readFileSync(path.join(home,name),'utf8')}));
 if(!texts.some(t=>/^(licen[cs]e|copying)([._-]|$)/i.test(t.name)&&t.data.trim()))throw new Error('Active builder is missing full license texts');
 return {home,pkg,texts,receipt:{name:pkg.name,version:pkg.version,runtime_vite_version:meta.viteVersion,package_json_sha256:sha(packageBytes),entry:path.relative(home,actual).replaceAll('\\','/'),entry_sha256:sha(fs.readFileSync(actual))}};
}
/** @param {{builderEntry?: string}} [options] @returns {import('vite').Plugin} */
export function frontendNotices({builderEntry}={}){return {name:'omd-emitted-notices',generateBundle(_options,bundle){
 const root=fs.realpathSync(process.cwd()),packages=new Map(),helpers=new Set(),pending=[];
 for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules)){
  if(id.startsWith('\0')){helpers.add(id.replaceAll(root,'<project>'));continue;}
  const physical=id.split('?')[0];if(!path.isAbsolute(physical))continue;
  const clean=fs.realpathSync(physical);
  let dir=path.dirname(clean),found;
  while(dir!==path.dirname(dir)){const pkg=path.join(dir,'package.json');if(fs.existsSync(pkg)){found={home:dir,pkg:JSON.parse(fs.readFileSync(pkg,'utf8'))};break;}dir=path.dirname(dir);}
  if(!found){pending.push('Unattributed module '+path.basename(clean));continue;}
  if(found.home===root)continue;
  const key=found.pkg.name+'@'+found.pkg.version;if(!packages.has(key))packages.set(key,{...found,modules:[]});packages.get(key).modules.push(path.relative(found.home,clean).replaceAll('\\','/'));
 }
 const notices=[],rows=[],lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
 /** @param {string} home @param {string} version */
 const checkLock=(home,version)=>{const key=path.relative(root,home).replaceAll('\\','/');if(lock.packages?.[key]?.version!==version)pending.push('Installed package differs from lock: '+key);};
 for(const [key,p] of [...packages].sort(([a],[b])=>a.localeCompare(b))){
  checkLock(p.home,p.pkg.version);
  /** @type {string[]} */
  const names=[];
  /** @param {string} dir */
  const walk=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const f=path.join(dir,entry.name);if(entry.isDirectory())walk(f);else if(entry.isFile()&&/^(licen[cs]e|copying|notice|copyright)([._-]|$)/i.test(entry.name))names.push(path.relative(p.home,f));}};walk(p.home);
  const retained=names.sort().map(name=>({name,text:fs.readFileSync(path.join(p.home,name),'utf8')}));
  if(!retained.some(t=>/^(licen[cs]e|copying)([._-]|$)/i.test(path.basename(t.name))&&t.text.trim()))pending.push(key+': missing installed full texts');
  const texts=retained.map(({name,text})=>{notices.push(`===== ${key} / ${name} =====\n${text}\n`);return {name,sha256:sha(text)};});for(const module of [...new Set(p.modules)].filter(n=>n.startsWith('external/'))){const source=fs.readFileSync(path.join(p.home,module),'utf8');if(/copyright/i.test(source)){notices.push(`===== ${key} embedded ${module} (complete module with original header) =====\n${source}\n`);texts.push({name:module,sha256:sha(source)});}else pending.push(key+': embedded module attribution review '+module);}
  rows.push({name:p.pkg.name,version:p.pkg.version,modules:[...new Set(p.modules)].sort(),texts});
 }
 let builder=null;
 if(helpers.size){const actual=activeBuilder(this.meta,builderEntry);builder={...actual.receipt,project_locked:actual.home.startsWith(path.join(root,'node_modules')+path.sep)};
  if(builder.project_locked)checkLock(actual.home,actual.pkg.version);
  const texts=actual.texts.map(({name,data})=>{notices.push(`===== ${actual.pkg.name}@${actual.pkg.version} emitted helpers / ${name} =====\n${data}\n`);return {name,sha256:sha(data)};});
  rows.push({name:actual.pkg.name,version:actual.pkg.version,modules:[...helpers].sort(),texts});
 }
 const text=notices.join('\n'),emitted=Object.fromEntries(Object.entries(bundle).sort(([a],[b])=>a.localeCompare(b)).map(([name,item])=>[name,sha(item.type==='chunk'?item.code:item.source)]));
 this.emitFile({type:'asset',fileName:'third-party/NOTICES.txt',source:text});
 this.emitFile({type:'asset',fileName:'third-party/frontend-receipt.json',source:JSON.stringify({schema:'omd-frontend-notices-v1',lock_sha256:sha(fs.readFileSync(path.join(root,'package-lock.json'))),coverage:'actual chunk inputs plus identified active-builder virtual helpers; full bundled-builder texts retained conservatively and require review',builder,packages:rows,emitted,notices_sha256:sha(text),pending,release_accepted:false},null,2)+'\n'});
 if(pending.length)this.error(pending.join('; '));
},writeBundle(options){
 // Final output bytes include HTML and any later Vite hooks. Receipt excludes itself.
 if(!options.dir)this.error('Frontend notice output directory is missing');
 const dir=path.resolve(options.dir),file=path.join(dir,'third-party/frontend-receipt.json');
 const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
 /** @type {Record<string, string>} */
 const emitted={};
 /** @param {string} folder */
 const walk=folder=>{for(const e of fs.readdirSync(folder,{withFileTypes:true})){const p=path.join(folder,e.name);if(e.isDirectory())walk(p);else if(e.isFile()){const rel=path.relative(dir,p).replaceAll('\\','/');if(!['third-party/frontend-receipt.json','third-party/NOTICES.txt'].includes(rel))emitted[rel]=sha(fs.readFileSync(p));}}};walk(dir);
 receipt.emitted=Object.fromEntries(Object.entries(emitted).sort(([a],[b])=>a.localeCompare(b)));
 fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
}};}
