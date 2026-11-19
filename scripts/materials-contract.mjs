// Release materials contract v1; kept in correspondence with shared fixtures.
import {createHash} from 'node:crypto';
export const kinds=['notices','source','instructions','provenance'];
export function validate(m,files,required,target,version,locks){
 const need=(ok,why)=>{if(!ok)throw new Error(why);};
 const portable=p=>need(typeof p==='string'&&p&&!p.startsWith('/')&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[ .]$/.test(x)),'Invalid portable path');
 need(!['/Users/','/Volumes/',':\\\\'].some(x=>JSON.stringify(m).includes(x)),'Machine-local material metadata');
 need(m.schema==='omd-materials-v1','Wrong materials schema');
 need(m.reviewed===true&&Array.isArray(m.pending)&&m.pending.length===0,'Materials review/pending coverage');
 need(m.target===target&&m.version===version,'Wrong materials target/version');
 const sorted=x=>JSON.stringify(Object.entries(x??{}).sort(([a],[b])=>a.localeCompare(b)));
 need(Object.keys(locks).length&&sorted(m.locks)===sorted(locks),'Stale/missing materials locks');
 need(Array.isArray(m.components)&&m.components.length,'Empty component coverage');
 const seen=new Set(),covered=new Set();
 const requiredNames=Array.isArray(required)?required:Object.keys(required);
 for(const c of m.components){
  need(typeof c.id==='string'&&!seen.has(c.id),'Duplicate/invalid component');seen.add(c.id);
  need(typeof c.version==='string'&&c.version,'Missing component version');
  need(c.status==='reviewed'&&Array.isArray(c.pending)&&!c.pending.length,'Unresolved component');
  need(sorted(Object.fromEntries(Object.keys(c.materials??{}).map(k=>[k,true])))===sorted(Object.fromEntries(kinds.map(k=>[k,true]))),'Missing required material kinds');
  need(c.artifacts&&typeof c.artifacts==='object'&&!Array.isArray(c.artifacts)&&Object.keys(c.artifacts).length,'Missing component artifacts');
  if(!Array.isArray(required)&&required[c.id]){need(c.version===required[c.id].version,'Wrong component version');need(Object.keys(c.artifacts).some(p=>required[c.id].prefix.endsWith('/')?p.startsWith(required[c.id].prefix):p===required[c.id].prefix),'Wrong component artifact');}
  for(const group of [c.artifacts,...Object.values(c.materials)]){
   need(group&&typeof group==='object'&&!Array.isArray(group)&&Object.keys(group).length,'Empty material coverage');
   for(const [p,h] of Object.entries(group)){portable(p);need(typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&files[p]===h,'Missing/changed material or artifact');covered.add(p);}
  }
 }
 need(requiredNames.every(x=>seen.has(x)),'Missing required components');
 need(Object.keys(files).every(p=>covered.has(p)),'Uncovered installed files');
 return {schema:'omd-materials-v1',coverage_validated:true,release_accepted:false};
}
export const nativeSchema='omd-native-notices-v2',reviewSchema='omd-native-review-v1';
export const categories=['missing-packaged-texts','native-applicability','upstream-text-applicability','toolchain-runtime'];
export const materialKinds=['legal-text','source-notice','attribution'];
export const evidenceRoles=['crate-archive','published-archive','distribution-archive','inspection','upstream-document'];
export function validateNativeReceipt(r,files,names,lock,target,notices,version){
 if(r.schema!==nativeSchema||!Array.isArray(r.pending)||r.pending.length||r.lock_sha256!==lock||r.target!==target)throw new Error('Stale/unresolved native receipt');
 const need=ok=>{if(!ok)throw new Error('Incomplete/unbound native notice evidence');};
 const digest=b=>createHash('sha256').update(b).digest('hex'),nonempty=x=>typeof x==='string'&&!!x;
 const uniqueStrings=x=>Array.isArray(x)&&x.every(nonempty)&&new Set(x).size===x.length;
 const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const statements=x=>Array.isArray(x)&&x.length>0&&x.every(s=>typeof s==='string'&&!!s.trim());
 const portable=p=>need(nonempty(p)&&!p.startsWith('/')&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[ .]$/.test(x)));
 const https=value=>{need(typeof value==='string');const u=new URL(value);need(u.protocol==='https:'&&!!u.host&&!u.username&&!u.password);return u;};
 const runtimeComponent=value=>{
  const u=https(value),release=/^release: (\S+)$/m.exec(r.toolchain),host=/^host: (\S+)$/m.exec(r.toolchain);
  need(release&&host&&u.host==='static.rust-lang.org'&&!u.search&&!u.hash&&value.startsWith('https://static.rust-lang.org/dist/'));
  const filename=value.replace(/^https:\/\/static\.rust-lang\.org\/dist\/(?:\d{4}-\d{2}-\d{2}\/)?/,'');
  for(const [component,triple] of [['rustc',host[1]],['rust-std',target]])if(['xz','gz'].some(ext=>filename===`${component}-${release[1]}-${triple}.tar.${ext}`))return component;
  need(false);
 };
 need(r.release_accepted===false);
 need(uniqueStrings(r.roots)&&r.roots.length);
 need(uniqueStrings(r.binaries)&&r.binaries.length===names.length&&names.every(n=>r.binaries.includes(n)));
 need(r.binary_roots&&typeof r.binary_roots==='object'&&!Array.isArray(r.binary_roots)&&Object.keys(r.binary_roots).length===names.length&&names.every(n=>r.roots.includes(r.binary_roots[n])));
 need(nonempty(r.toolchain)&&nonempty(r.coverage)&&typeof r.requested_features==='string'&&typeof r.default_features==='boolean');
 need(Buffer.isBuffer(notices)&&notices.length);
 const descriptor=r.notices,noticeHash=digest(notices);
 need(descriptor&&Object.keys(descriptor).length===3&&descriptor.path==='native-NOTICES.txt'&&descriptor.sha256===noticeHash&&descriptor.bytes===notices.length&&files['third-party/native-NOTICES.txt']===noticeHash);
 need(Array.isArray(r.packages)&&r.packages.length);
 const tagged=new Map(),key=x=>JSON.stringify(x);
 // Every retained text, packaged or review-supplied, is bound to its bytes.
 const span=(t,owner)=>{
  need(object(t));portable(t.path);
  need(Number.isSafeInteger(t.offset)&&Number.isSafeInteger(t.bytes)&&t.offset>=0&&t.bytes>=0&&t.offset+t.bytes<=notices.length);
  need(hex(t.sha256)&&digest(notices.subarray(t.offset,t.offset+t.bytes))===t.sha256);
  const reviewed=Object.hasOwn(t,'review_finding');
  if(reviewed){need(t.bytes>0&&typeof t.review_finding==='string'&&materialKinds.includes(t.kind)&&typeof t.reason==='string'&&!!t.reason.trim()&&object(t.origin));if(!tagged.has(t.review_finding))tagged.set(t.review_finding,[]);tagged.get(t.review_finding).push([key(owner),t.path,t.kind,t]);}
  need(reviewed||owner!==null);
  return {bytes:t.bytes,reviewed,kind:t.kind};
 };
 const seen=new Set(),roots=new Map(),identities=new Set();
 for(const p of r.packages){
  need(p&&['name','version','source','license_metadata','features','texts'].every(k=>Object.hasOwn(p,k))&&(p.source===null||typeof p.source==='string')&&(p.license_metadata===null||typeof p.license_metadata==='string'));
  need(p&&nonempty(p.name)&&nonempty(p.version)&&!seen.has(JSON.stringify([p.name,p.version])));seen.add(JSON.stringify([p.name,p.version]));
  need(Array.isArray(p.features)&&p.features.every(x=>typeof x==='string')&&Array.isArray(p.texts)&&p.texts.length);
  if(r.roots.includes(p.name)){need(p.source===null&&!roots.has(p.name));roots.set(p.name,p.version);}
  const owner=[p.name,p.version,p.source];identities.add(key(owner));
  const spans=p.texts.map(t=>span(t,owner));
  need(spans.reduce((n,x)=>n+x.bytes,0)>0);
  // Review materials only replace missing packaged terms with full legal text.
  need(spans.some(x=>!x.reviewed||x.kind==='legal-text'));
 }
 need(roots.size===r.roots.length&&[...roots.values()].every(v=>v===version));
 need(Array.isArray(r.runtime_materials));
 for(const t of r.runtime_materials)span(t,null);
 const review=r.review;
 need(object(review)&&review.schema===reviewSchema&&hex(review.input_sha256)&&Array.isArray(review.findings)&&review.findings.length);
 const ids=new Set(),keys=new Set();let runtimeFindings=0;
 for(const f of review.findings){
  need(object(f)&&typeof f.id==='string'&&/^[a-z0-9][a-z0-9._-]{0,127}$/.test(f.id)&&!ids.has(f.id));ids.add(f.id);
  need(categories.includes(f.category)&&object(f.subject));
  let owner;
  if(f.category==='toolchain-runtime'){need(Object.keys(f.subject).length===1&&f.subject.toolchain===r.toolchain);owner=null;runtimeFindings++;}
  else{const k=Object.keys(f.subject);need(k.length===3&&['name','version','source'].every(x=>k.includes(x)&&typeof f.subject[x]==='string'));owner=[f.subject.name,f.subject.version,f.subject.source];need(identities.has(key(owner)));}
  need(!keys.has(key([f.category,owner])));keys.add(key([f.category,owner]));
  need(statements(f.facts)&&statements(f.limits));
  need(Array.isArray(f.evidence));
  const evidence=new Map();
  for(const e of f.evidence){
   need(object(e)&&evidenceRoles.includes(e.role)&&hex(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>=0);portable(e.path);
   need(!evidence.has(e.path));evidence.set(e.path,e);
   if(!['crate-archive','inspection'].includes(e.role))https(e.url);
   if(['crate-archive','published-archive','distribution-archive'].includes(e.role))need(e.bytes>0);
  }
  const crates=[...evidence.values()].filter(e=>e.role==='crate-archive').map(e=>e.path);
  if(owner===null){need(!crates.length);need(JSON.stringify([...evidence.values()].filter(e=>e.role==='distribution-archive').map(e=>runtimeComponent(e.url)).sort())===JSON.stringify(['rust-std','rustc']));}
  else need(crates.length===1);
  need(Array.isArray(f.materials)&&f.materials.every(x=>typeof x==='string')&&new Set(f.materials).size===f.materials.length);
  const spans=tagged.get(f.id)??[];
  need(JSON.stringify([...f.materials].sort())===JSON.stringify(spans.map(x=>x[1]).sort())&&spans.every(x=>x[0]===key(owner)));
  const kinds=new Map(spans.map(x=>[x[1],x[2]]));
  const origins=new Map();
  for(const [,path,kind,text] of spans){
   const o=text.origin;origins.set(path,o);
   if(o.type==='archive-member'){
    need(Object.keys(o).sort().join(',')==='archive,archive_sha256,member,type');portable(o.member);portable(o.archive);
    const e=evidence.get(o.archive);need(e&&['crate-archive','published-archive','distribution-archive'].includes(e.role)&&o.archive_sha256===e.sha256);
    need(kind!=='source-notice'||['crate-archive','published-archive'].includes(e.role));need(owner!==null||e.role==='distribution-archive');
   }else if(o.type==='upstream-revision'){
    need(Object.keys(o).sort().join(',')==='revision,type,url'&&typeof o.revision==='string'&&/^[a-f0-9]{40}$/.test(o.revision)&&typeof o.url==='string'&&o.url.includes(o.revision));https(o.url);need(kind!=='attribution'&&owner!==null);
   }else if(o.type==='published-terms'){need(Object.keys(o).sort().join(',')==='type,url'&&kind==='legal-text'&&owner!==null);https(o.url);}
   else need(false);
  }
  need(f.category!=='missing-packaged-texts'||[...kinds.values()].includes('legal-text'));
  need(f.category!=='toolchain-runtime'||f.materials.length>0);
  const copied=f.copied_sources??[];
  need(Array.isArray(copied)&&(!copied.length||owner!==null));
  for(const c of copied){
   need(object(c)&&nonempty(c.name)&&nonempty(c.version)&&hex(c.archive_sha256)&&statements(c.members)&&statements(c.facts)&&statements(c.materials));
   portable(c.archive);for(const m of c.members)portable(m);
   const picked=c.materials.map(x=>kinds.get(x));
   need(c.materials.every(x=>f.materials.includes(x))&&picked.includes('legal-text')&&picked.includes('source-notice'));
   const e=evidence.get(c.archive);need(e&&e.role==='published-archive'&&e.sha256===c.archive_sha256);
   need(c.materials.some(p=>kinds.get(p)==='legal-text'&&(origins.get(p).type==='upstream-revision'||origins.get(p).archive===c.archive)));
   need(c.materials.some(p=>kinds.get(p)==='source-notice'&&origins.get(p).archive===crates[0]));
  }
 }
 need([...tagged.keys()].every(x=>ids.has(x))&&runtimeFindings===1);
 const artifacts=Object.fromEntries((r.artifacts??[]).map(x=>[x.name,x.sha256])),suffix=target.includes('windows')?'.exe':'';
 if(Object.keys(artifacts).length!==(r.artifacts??[]).length||Object.keys(artifacts).length!==names.length||names.some(n=>files['bin/'+n+suffix]!==artifacts[n]))throw new Error('Native receipt artifact mismatch');
}
