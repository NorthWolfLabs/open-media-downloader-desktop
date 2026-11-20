// Final materials contract (omd-final-materials-v1 and -v2), phase two of the release
// materials binding. Kept in exact correspondence with the engine's scripts/final_materials.py
// validate_final through byte-identical shared fixtures (one file per contract version). It
// validates coverage, statuses, routes, receipts and relation shapes against the actual final
// payload and delivery inventories; byte-level relation proofs are re-derived by the engine
// binder. The document schema selects the rules: v2 adds the typed extractor route (stock or
// controlled-source); anything else is held to the unchanged v1 rules, which pin the stock
// extractor method.
import {createHash} from 'node:crypto';
import {validate as validateInitial,kinds,binaryName} from './materials-contract.mjs';
export const finalSchema='omd-final-materials-v1',finalName='final-materials-v1.json';
export const finalSchemaV2='omd-final-materials-v2',finalNameV2='final-materials-v2.json';
const SEAL='Contents/_CodeSignature/CodeResources',INFO='Contents/Info.plist',V1='third-party/materials-v1.json';
const purposes=['distribution-candidate','private-validation'],bases=['initial-review','final-review'],routes=['payload','delivery'];
const triples={'darwin-arm64':'aarch64-apple-darwin','darwin-x64':'x86_64-apple-darwin'};
const layoutVersion='omd-macho-signature-layout-v2';
const local=['/Users/','/Volumes/','/private/','/home/','/tmp/',':\\\\'];
const top=['schema','purpose','target','version','locks','layout','signing','initial_review','input','payload','relations','receipts','components','delivery','pending','reviewed','coverage_validated','distribution_candidate','release_accepted','limits'];
const signingFields=['mode','team_id','purpose','materials_binding','status','plan_sha256','report_sha256','bundle_id'];
const receiptFields=['receipt','notices','binaries','artifacts','lock_sha256','target','version','findings','spans','spans_in_payload','pending','release_accepted'];
const componentFields=['id','version','basis','initial_component','status','pending','artifacts','materials'];
const methods={'signature-only':'paired-structure','prepared-extractor':'omd-pyinstaller-6.22.0-onefile-signature-only-v1','managed-manifest':'digest-fields-only','build-inventory':'digests-and-signing-record','engine-receipt':'artifact-only-rebinding','outer-seal':'code-resources-hash2','nested-seal':'code-resources-hash2'};
const relationFields={identical:['kind','before','after'],'signature-only':['kind','before','after','method','layout','signature_independent_sha256'],'prepared-extractor':['kind','before','after','method','prepared','signature_only_natives','identical_non_natives','signature_independent_sha256'],'managed-manifest':['kind','before','after','method'],'build-inventory':['kind','before','after','method'],'engine-receipt':['kind','before','after','method'],'outer-seal':['kind','before','after','method','sealed_files'],'nested-seal':['kind','before','after','method','sealed_files']};
// omd-final-materials-v2: every v1 field plus the typed extractor route; the prepared-extractor
// relation gains a route label that must pair with its method.
const topV2=[...top.slice(0,top.indexOf('receipts')),'extractor',...top.slice(top.indexOf('receipts'))];
const relationFieldsV2={...relationFields,'prepared-extractor':[...relationFields['prepared-extractor'],'route']};
const extractorRoutes={'omd-pyinstaller-6.22.0-onefile-signature-only-v1':'upstream-stock','omd-pyinstaller-6.22.0-source-bootloader-onefile-signature-only-v1':'controlled-source'};
const extractorFields=['path','component','route','method','version','target_arch','producer','prepared','members_verified','report','source'];
const sourceFields=['evidence','kit','bootloader','profile','plan_sha256','receipt_sha256','members','natives'];
const sourceEvidenceSchema='omd-macos-extractor-source-evidence-v1',sourceProfileFile='distribution/yt-dlp-source-curl/profile.json';
const stockBootloader='ca3cc654cebdb7a005872a4ff4fad10bfe34926f6f6425946b0dc6285289a879';
const extractorArches=['universal2','arm64','x86_64'],targetArch={'darwin-arm64':'arm64','darwin-x64':'x86_64'};
// A nested application bundle under the resources (the macOS sign-in window): its main executable
// is a code object, and signing adds exactly its Contents/_CodeSignature seal.
const nestedCode=/^(.+\.app)\/Contents\/MacOS\/[A-Za-z0-9._-]{1,128}$/,nestedSeal='/Contents/_CodeSignature/CodeResources';
const nestedBundles=(code,res)=>Object.fromEntries(Object.keys(code).filter(p=>p.startsWith(res+'/')).map(p=>[p.match(nestedCode)?.[1],p]).filter(([root])=>root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const canon=x=>Array.isArray(x)?'['+x.map(canon).join(',')+']':object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}':JSON.stringify(x);
const same=(a,b)=>canon(a)===canon(b);
export const canonicalInventory=files=>sha('{'+Object.keys(files).sort().map(k=>JSON.stringify(k)+':{"bytes":'+files[k].bytes+',"sha256":'+JSON.stringify(files[k].sha256)+'}').join(',')+'}');
export function validateFinal(doc,initialBytes,payload,delivery,expect){
 const v2=object(doc)&&typeof doc.schema==='string'&&doc.schema===finalSchemaV2;
 const [topFields,names]=v2?[topV2,[finalName,finalNameV2]]:[top,[finalName]];
 const need=(ok,why)=>{if(!ok)throw new Error(why);};
 const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 const keys=(o,w)=>object(o)&&Object.keys(o).length===w.length&&w.every(k=>Object.hasOwn(o,k));
 const identity=v=>keys(v,['bytes','sha256'])&&Number.isSafeInteger(v.bytes)&&v.bytes>0&&hex(v.sha256);
 const finalPath=p=>{need(typeof p==='string'&&!!p&&!p.startsWith('/')&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[ .]$/.test(x)),'Invalid portable path');need(/^[\x20-\x7e]+$/.test(p),'Invalid portable path');return p;};
 const filesMap=(value,what)=>{
  need(object(value)&&Object.keys(value).length>0,`Invalid ${what} inventory`);
  const folded=new Set();
  for(const [p,row] of Object.entries(value)){
   finalPath(p);need(!folded.has(p.toLowerCase()),`Duplicate or colliding ${what} path`);folded.add(p.toLowerCase());
   need(keys(row,['bytes','sha256'])&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&hex(row.sha256),`Invalid ${what} inventory`);
   need(!names.includes(p.split('/').at(-1)),'Final materials must stay outside the signed payload and delivery set');
  }
 };
 need(keys(doc,topFields),'Unknown/missing final materials fields');
 need(!local.some(x=>JSON.stringify(doc).includes(x)),'Machine-local final materials metadata');
 need(doc.schema===(v2?finalSchemaV2:finalSchema),'Wrong final materials schema');
 need(doc.release_accepted===false,'Final materials never accept a release');
 need(purposes.includes(doc.purpose),'Unknown final materials purpose');
 need(doc.purpose==='distribution-candidate','Private-validation output is never a distribution candidate');
 const s=doc.signing;
 need(keys(s,signingFields)&&s.purpose===doc.purpose&&s.mode==='developer-id'&&s.materials_binding==='two-phase'&&s.status==='signed-awaiting-final-materials'&&typeof s.team_id==='string'&&/^[A-Z0-9]{10}$/.test(s.team_id)&&hex(s.plan_sha256)&&hex(s.report_sha256),'Final binding requires a fresh two-phase Developer ID distribution-candidate signing run');
 need(typeof doc.target==='string'&&Object.hasOwn(triples,doc.target)&&doc.target===expect.target&&doc.version===expect.version,'Wrong final materials target/version');
 need(object(doc.locks)&&Object.keys(doc.locks).length>0&&same(doc.locks,expect.locks),'Stale/missing final materials locks');
 need(Array.isArray(doc.pending)&&doc.pending.length===0&&doc.reviewed===true&&doc.coverage_validated===true&&doc.distribution_candidate===true,'Pending final materials coverage');
 need(Array.isArray(doc.limits)&&doc.limits.length>0&&doc.limits.every(x=>typeof x==='string'&&!!x.trim()),'Invalid final materials limits');
 const layout=doc.layout;
 need(keys(layout,['resources','executable','bundle_id','code'])&&typeof layout.executable==='string'&&/^[A-Za-z0-9._-]{1,128}$/.test(layout.executable)&&layout.bundle_id===s.bundle_id&&object(layout.code),'Invalid final payload layout');
 const res=finalPath(layout.resources),shell='Contents/MacOS/'+layout.executable,code=layout.code;
 need(code[shell]==='desktop-shell'&&Object.values(code).filter(r=>r==='yt-dlp').length===1&&Object.values(code).every(r=>typeof r==='string'&&/^[a-z0-9-]{1,64}$/.test(r)),'Invalid final payload layout');
 for(const p of Object.keys(code)){finalPath(p);need(p===shell||p.startsWith(res+'/'),'Invalid final payload layout');}
 for(const name of ['input','payload']){
  need(keys(doc[name],['inventory_sha256','files']),`Invalid ${name} inventory`);
  filesMap(doc[name].files,name);
  need(doc[name].inventory_sha256===canonicalInventory(doc[name].files),`Invalid ${name} inventory`);
 }
 need(keys(doc.delivery,['files']),'Invalid delivery inventory');
 filesMap(doc.delivery.files,'delivery');
 need(same(doc.payload.files,payload),'Final payload differs from the bound payload inventory');
 need(same(doc.delivery.files,delivery),'Delivery set differs from the bound delivery inventory');
 const before=doc.input.files,after=doc.payload.files,shipped=doc.delivery.files,has=(o,k)=>Object.hasOwn(o,k);
 const bundles=nestedBundles(code,res),seals=Object.fromEntries(Object.keys(bundles).map(root=>[root+nestedSeal,root]));
 need(Object.keys(before).every(p=>has(after,p)),'Unexpected removal of an input file');
 need(Object.keys(after).every(p=>has(before,p)||p===SEAL||has(seals,p)),'Unexpected new payload file');
 need(has(after,INFO)&&has(after,SEAL)&&Object.keys(code).every(p=>has(after,p))&&Object.keys(after).every(p=>p.startsWith('Contents/')),'Invalid final payload layout');
 need(Object.keys(seals).every(p=>has(after,p)&&!has(before,p)),'A nested bundle is not freshly sealed');
 const relations=doc.relations;
 need(object(relations)&&Object.keys(relations).length===Object.keys(after).length&&Object.keys(after).every(p=>has(relations,p)),'Relations must cover exactly the final payload');
 const fixed={[res+'/tools/tools-v2.json']:'managed-manifest',[res+'/browser/browser-tools-v2.json']:'managed-manifest',[res+'/build-inventory.json']:'build-inventory',[res+'/third-party/native-receipt.json']:'engine-receipt',[SEAL]:'outer-seal',...Object.fromEntries(Object.keys(seals).map(p=>[p,'nested-seal']))};
 const fields=v2?relationFieldsV2:relationFields;
 for(const [p,r] of Object.entries(relations)){
  const kind=has(code,p)?(code[p]==='yt-dlp'?'prepared-extractor':'signature-only'):(fixed[p]??'identical');
  need(object(r)&&r.kind===kind&&keys(r,fields[kind]),'Unexpected relation for '+p);
  need(r.before===(has(before,p)?before[p].sha256:null)&&r.after===after[p].sha256,'Relation does not bind input and final bytes: '+p);
  if(kind==='identical'){need(r.before===r.after,'Unexpected payload change: '+p);continue;}
  // v2: a known method with exactly its own route label; v1 pins the stock method instead.
  const method=v2&&kind==='prepared-extractor'?typeof r.method==='string'&&Object.hasOwn(extractorRoutes,r.method)&&extractorRoutes[r.method]===r.route:r.method===methods[kind];
  need(method&&(r.before!==null||kind==='outer-seal'||kind==='nested-seal'),'Unexpected relation for '+p);
  if(has(code,p)){
   need(r.before!==r.after,'Code object was not re-signed: '+p);
   need(hex(r.signature_independent_sha256),'Unexpected relation for '+p);
   if(kind==='signature-only')need(r.layout===layoutVersion,'Unexpected relation for '+p);
   else need(hex(r.prepared)&&r.prepared!==r.before&&r.prepared!==r.after&&Number.isSafeInteger(r.signature_only_natives)&&r.signature_only_natives>0&&Number.isSafeInteger(r.identical_non_natives)&&r.identical_non_natives>=0,'Unexpected relation for '+p);
  }
  if(kind==='outer-seal')need(Number.isSafeInteger(r.sealed_files)&&r.sealed_files===Object.keys(after).length-3,'Unexpected relation for '+p);
  if(kind==='nested-seal'){
   const root=seals[p],inside=Object.keys(after).filter(q=>q.startsWith(root+'/')&&q!==root+'/'+INFO&&q!==bundles[root]&&q!==p);
   need(r.before===null&&Number.isSafeInteger(r.sealed_files)&&r.sealed_files===inside.length,'Unexpected relation for '+p);
  }
 }
 let x=null,extractor=null,kit=null;
 if(v2){
  // The typed extractor route: it must restate the relation it explains, and the stock and
  // controlled-source routes can never carry each other's proof.
  x=doc.extractor;extractor=Object.keys(code).find(p=>code[p]==='yt-dlp');
  const r=relations[extractor];
  let ok=keys(x,extractorFields)&&x.path===extractor&&typeof x.component==='string'&&typeof x.method==='string'&&Object.hasOwn(extractorRoutes,x.method)&&extractorRoutes[x.method]===x.route&&x.method===r.method&&x.route===r.route;
  const want=ok&&Object.hasOwn(expect.required,x.component)?expect.required[x.component]:null;
  ok=ok&&object(want)&&typeof want.prefix==='string'&&(want.prefix.endsWith('/')?extractor.startsWith(res+'/'+want.prefix):extractor===res+'/'+want.prefix)
   &&x.version===want.version&&identity(x.producer)&&same(x.producer,before[extractor])&&identity(x.prepared)&&x.prepared.sha256===r.prepared
   &&Number.isSafeInteger(x.members_verified)&&x.members_verified===r.signature_only_natives&&extractorArches.includes(x.target_arch)&&['universal2',targetArch[doc.target]].includes(x.target_arch);
  need(ok,'Invalid extractor route binding');
  if(x.route==='upstream-stock')need(x.report===null&&x.source===null,'Stock extractor route cannot carry controlled-source evidence');
  else{
   need(x.report!==null&&x.source!==null,'Controlled-source route requires its source evidence and preparation report');
   const source=x.source;
   need(identity(x.report)&&keys(source,sourceFields)&&keys(source.evidence,['schema','bytes','sha256'])&&source.evidence.schema===sourceEvidenceSchema
    &&identity({bytes:source.evidence.bytes,sha256:source.evidence.sha256})&&identity(source.bootloader)&&source.bootloader.sha256!==stockBootloader
    &&keys(source.profile,['file','id','sha256'])&&source.profile.file===sourceProfileFile&&typeof source.profile.id==='string'
    &&!!source.profile.id&&hex(source.profile.sha256)&&hex(source.plan_sha256)&&hex(source.receipt_sha256)
    &&Number.isSafeInteger(source.natives)&&source.natives===r.signature_only_natives
    &&Number.isSafeInteger(source.members)&&source.members===source.natives+r.identical_non_natives
    &&x.target_arch==='arm64'&&doc.target==='darwin-arm64'
    &&keys(source.kit,['locator','bytes','sha256'])&&typeof source.kit.locator==='string','Invalid controlled-source evidence binding');
   kit=source.kit;
   const at=kit.locator.indexOf(':'),route=at<0?kit.locator:kit.locator.slice(0,at),kitPath=at<0?'':kit.locator.slice(at+1);
   need(route==='delivery'&&Number.isSafeInteger(kit.bytes)&&has(shipped,kitPath)&&same(shipped[kitPath],{bytes:kit.bytes,sha256:kit.sha256}),'Controlled-source kit is not a bound delivery file');
  }
 }
 const review=doc.initial_review;
 need(review!==null,'Missing initial omd-materials-v1 review');
 const v1path=res+'/'+V1;
 need(keys(review,['schema','path','sha256','bytes'])&&review.schema==='omd-materials-v1'&&review.path===v1path,'Invalid initial review binding');
 need(Buffer.isBuffer(initialBytes)&&sha(initialBytes)===review.sha256&&initialBytes.length===review.bytes,'Initial review bytes differ from the bound initial review');
 need(after[v1path]?.sha256===review.sha256&&relations[v1path].kind==='identical','Initial review is not the unchanged in-app manifest');
 const initial=JSON.parse(initialBytes.toString('utf8'));
 const staged=Object.fromEntries(Object.entries(before).filter(([p])=>p.startsWith(res+'/')&&p!==res+'/build-inventory.json'&&p!==v1path).map(([p,row])=>[p.slice(res.length+1),row.sha256]));
 validateInitial(initial,staged,expect.required,doc.target,doc.version,doc.locks);
 const receipts=doc.receipts;
 need(keys(receipts,['engine','desktop'])&&receipts.engine!==null&&receipts.desktop!==null,'Missing final native receipt binding');
 // Each engine binary is found where the binding's own layout records it, never rebuilt from the
 // current layout: older bindings carry the macOS sign-in helper as a plain bin/omd-signin.
 const located={};
 for(const p of Object.keys(code).filter(p=>p.startsWith(res+'/bin/'))){const n=binaryName(p.slice(res.length+1));need(!!n&&!has(located,n),'Invalid final payload layout');located[n]=p;}
 const triple=triples[doc.target],binaries=Object.keys(located).sort();
 const bound=(r,names,artifacts,lock)=>keys(r,receiptFields)&&same(r.binaries,names)&&same(r.artifacts,artifacts)&&typeof lock==='string'&&r.lock_sha256===lock&&r.target===triple&&r.version===doc.version&&Number.isSafeInteger(r.findings)&&r.findings>0&&Number.isSafeInteger(r.spans)&&r.spans>0&&r.spans_in_payload===r.spans&&Array.isArray(r.pending)&&r.pending.length===0&&r.release_accepted===false;
 const engine=receipts.engine,receiptPath=res+'/third-party/native-receipt.json',noticesPath=res+'/third-party/native-NOTICES.txt';
 need(binaries.length>0&&has(after,receiptPath)&&has(after,noticesPath)&&bound(engine,binaries,Object.fromEntries(binaries.map(n=>[n,after[located[n]].sha256])),doc.locks['Cargo.lock'])&&same(engine.receipt,{path:receiptPath,sha256:after[receiptPath].sha256})&&same(engine.notices,{path:noticesPath,sha256:after[noticesPath].sha256}),'Engine receipt does not bind the final payload');
 const desktop=receipts.desktop,detached=object(desktop)?[desktop.receipt??null,desktop.notices??null]:[];
 need(bound(desktop,[layout.executable],{[layout.executable]:after[shell].sha256},doc.locks['desktop-Cargo.lock'])&&detached.every(x=>keys(x,['path','sha256'])&&typeof x.path==='string'&&has(shipped,x.path)&&shipped[x.path].sha256===x.sha256),'Desktop receipt does not bind the final executable');
 const components=doc.components;
 need(Array.isArray(components)&&components.length>0,'Empty final component coverage');
 const initialComponents=new Map(initial.components.map(c=>[c.id,c]));
 const ids=new Map(),covered=new Set(),delivered=new Set(detached.map(x=>x.path));
 for(const c of components){
  need(keys(c,componentFields)&&typeof c.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(c.id)&&!ids.has(c.id)&&typeof c.version==='string'&&!!c.version&&bases.includes(c.basis),'Duplicate/invalid final component');
  ids.set(c.id,c);
  need(c.status==='reviewed'&&Array.isArray(c.pending)&&c.pending.length===0,'Unresolved final component');
  need(object(c.artifacts)&&Object.keys(c.artifacts).length>0,'Missing final component artifacts');
  for(const [p,a] of Object.entries(c.artifacts)){
   need(keys(a,['initial','final'])&&has(after,p)&&a.final===after[p].sha256&&a.initial===relations[p].before,'Final component artifact is not bound: '+p);
   covered.add(p);
  }
  need(object(c.materials)&&keys(c.materials,kinds),'Missing required material kinds');
  for(const kind of kinds){
   const group=c.materials[kind];
   need(object(group)&&Object.keys(group).length>0,'Empty final material coverage');
   for(const [locator,digest] of Object.entries(group)){
    const at=locator.indexOf(':'),route=at<0?locator:locator.slice(0,at),p=at<0?'':locator.slice(at+1);
    need(routes.includes(route)&&!!p,'Unknown material route');
    finalPath(p);
    const table=route==='payload'?after:shipped;
    need(hex(digest)&&has(table,p)&&table[p].sha256===digest,'Missing/changed final material: '+locator);
    (route==='payload'?covered:delivered).add(p);
   }
  }
  if(c.basis==='initial-review'){
   const source=typeof c.initial_component==='string'?initialComponents.get(c.initial_component):undefined;
   const carried=c.initial_component===c.id&&source!==undefined&&source.version===c.version
    &&same(Object.keys(c.artifacts).sort(),Object.keys(source.artifacts).map(p=>res+'/'+p).sort())
    &&Object.entries(source.artifacts).every(([p,h])=>c.artifacts[res+'/'+p].initial===h)
    &&kinds.every(kind=>Object.entries(source.materials[kind]).every(([p,h])=>relations[res+'/'+p]?.before===h&&has(c.materials[kind],'payload:'+res+'/'+p)));
   need(carried,'Initial review facts do not carry to the final payload: '+c.id);
  }else need(c.initial_component===null&&!initialComponents.has(c.id),'Final review cannot replace initial review facts: '+c.id);
 }
 for(const name of Object.keys(expect.required))need(ids.has(name)&&ids.get(name).basis==='initial-review','Missing required final components');
 for(const [name,want] of Object.entries(expect.final_components))need(ids.has(name)&&ids.get(name).basis==='final-review'&&ids.get(name).version===want.version&&has(ids.get(name).artifacts,want.artifact),'Missing required final components');
 if(v2){
  // The route explains the reviewed initial extractor component, and a controlled-source kit is
  // that component's typed source material (never another component's, never a waiver).
  const owner=ids.get(x.component);
  need(owner!==undefined&&owner.basis==='initial-review'&&has(owner.artifacts,extractor),'Extractor route is not bound to its initial-review component');
  need(kit===null||(has(owner.materials.source,kit.locator)&&owner.materials.source[kit.locator]===kit.sha256),'Controlled-source kit is not a source material of the extractor component');
 }
 need(Object.keys(after).every(p=>covered.has(p)),'Uncovered final payload files');
 need(Object.keys(shipped).every(p=>delivered.has(p)),'Unreferenced delivery file');
 return {schema:v2?finalSchemaV2:finalSchema,coverage_validated:true,distribution_candidate:true,release_accepted:false};
}
