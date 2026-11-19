// Notarized materials envelope (omd-notarized-materials-v1, method omd-apple-stapled-app-ticket-v1).
// Kept in exact correspondence with the engine's scripts/notarized_materials.py validate_notarized
// and load_strict through the byte-identical notarized-materials-fixtures-v1.json. The envelope
// composes one unchanged omd-final-materials-v1/-v2 signed binding (validated here by the unchanged
// validateFinal) with the stapled ticket, the archive Apple accepted and the distribution archive.
// Success is structural consistency only: macos_verification_required is always true, and nothing
// here can establish Apple acceptance, notarization or a release. Only the engine's macOS verifier
// (bind-notarized-materials.py) runs the actual checks, freshly, wherever acceptance is consumed.
import {createHash} from 'node:crypto';
import {validateFinal,canonicalInventory} from './final-materials-contract.mjs';
export const notarizedSchema='omd-notarized-materials-v1',notarizedMethod='omd-apple-stapled-app-ticket-v1',notarizedName='notarized-materials-v1.json';
const ticketPath='Contents/CodeResources',ticketMax=1048576,targets={'darwin-arm64':'arm64'},purpose='distribution-candidate',transportRoot='__MACOSX';
const bindingSchemas=['omd-final-materials-v1','omd-final-materials-v2'];
const local=['/Users/','/Volumes/','/private/','/home/','/tmp/',':\\\\'];
const maxJsonBytes=16*1024*1024,maxJsonDepth=64;
const top=['schema','method','target','version','purpose','signing','signed_binding','signed_payload','stapled_payload','ticket','outer_code','submission','distribution_archive','release_accepted'];
const expectFields=['binding_sha256','team_id','target','version','purpose','locks','required','final_components'];
const submissionFields=['id','status','status_code','app_member','log','uploaded_archive','transport'];
const distributionFields=['app_member','artifact','payload_inventory_sha256','transport'];
const bindingRef=['schema','locator','bytes','sha256'],ref=['locator','bytes','sha256'],inventory=['inventory_sha256','files'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(o,w)=>object(o)&&Object.keys(o).length===w.length&&w.every(k=>Object.hasOwn(o,k));
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const team=x=>typeof x==='string'&&/^[A-Z0-9]{10}$/.test(x);
const integer=x=>typeof x==='number'&&Number.isSafeInteger(x);
const identity=(v,positive=true)=>keys(v,['bytes','sha256'])&&integer(v.bytes)&&(positive?v.bytes>0:v.bytes>=0)&&hex(v.sha256);
const canon=x=>Array.isArray(x)?'['+x.map(canon).join(',')+']':object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}':JSON.stringify(x);
const same=(a,b)=>canon(a)===canon(b);
const sorted=o=>Object.keys(o).sort();
const finalPath=p=>{
 if(!(typeof p==='string'&&!!p&&!p.startsWith('/')&&!/[\\:\x00-\x1f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[ .]$/.test(x))&&/^[\x20-\x7e]+$/.test(p)))throw new Error('Invalid portable path');
 return p;
};
const need=(ok,why)=>{if(!ok)throw new Error(why);};
// Deepest object/array nesting, counted outside strings (also on invalid text).
const depth=text=>{
 let level=0,deepest=0,quoted=false,escaped=false;
 for(const c of text){
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
  else if(c==='"')quoted=true;
  else if(c==='{'||c==='['){level++;deepest=Math.max(deepest,level);}
  else if(c==='}'||c===']')level--;
 }
 return deepest;
};
// Strict JSON from raw bytes, identical to load_strict in the engine: UTF-8 without a BOM, at
// most 16 MiB and 64 levels, standard JSON only, syntax checked before duplicate keys, which are
// refused at every level (JSON.parse alone would silently keep the last value).
export function loadStrict(raw){
 need(raw instanceof Uint8Array,'Invalid JSON');
 need(raw.length<=maxJsonBytes,'JSON input exceeds the size bound');
 let text;
 try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);}catch{throw new Error('Invalid JSON');}
 need(!text.startsWith('﻿')&&depth(text)<=maxJsonDepth,'Invalid JSON');
 let value;
 try{value=JSON.parse(text);}catch{throw new Error('Invalid JSON');}
 const stack=[];
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   let j=i+1;
   while(text[j]!=='"'){if(text[j]==='\\')j++;j++;}
   const frame=stack.at(-1);
   if(frame&&frame.object&&frame.expectKey){
    const key=JSON.parse(text.slice(i,j+1));
    need(!frame.keys.has(key),'Duplicate JSON key');
    frame.keys.add(key);frame.expectKey=false;
   }
   i=j;
  }else if(c==='{')stack.push({object:true,keys:new Set(),expectKey:true});
  else if(c==='[')stack.push({object:false});
  else if(c==='}'||c===']')stack.pop();
  else if(c===','&&stack.at(-1)?.object)stack.at(-1).expectKey=true;
 }
 return value;
}
const filesMap=(value,what,empty=false)=>{
 need(object(value)&&(empty||Object.keys(value).length>0),`Invalid ${what} inventory`);
 const folded=new Set();
 for(const p of sorted(value)){
  finalPath(p);
  need(!folded.has(p.toLowerCase()),`Duplicate or colliding ${what} path`);folded.add(p.toLowerCase());
  need(identity(value[p],false),`Invalid ${what} inventory`);
  need(p.split('/').at(-1)!==notarizedName,'Notarized materials must stay outside the payloads, archives and evidence');
 }
};
// The sequestered AppleDouble member that carries one archive entry's metadata.
export const appledouble=entry=>{const at=entry.lastIndexOf('/');return transportRoot+'/'+(at<0?'':entry.slice(0,at)+'/')+'._'+entry.slice(at+1);};
const described=(app,files)=>{
 const entries=new Set([app]);
 for(const p of Object.keys(files)){const parts=p.split('/');for(let i=1;i<=parts.length;i++)entries.add(app+'/'+parts.slice(0,i).join('/'));}
 return new Set([...entries].map(appledouble));
};
export function validateNotarized(doc,signedBindingBytes,initialBytes,signedPayload,stapledPayload,delivery,archiveIdentities,evidenceIdentities,expect){
 need(keys(doc,top),'Unknown/missing notarized materials fields');
 need(!local.some(x=>JSON.stringify(doc).includes(x)),'Machine-local notarized materials metadata');
 need(doc.schema===notarizedSchema,'Wrong notarized materials schema');
 need(doc.method===notarizedMethod,'Unknown notarization method');
 need(doc.release_accepted===false,'Notarized materials never accept a release');
 need(keys(expect,expectFields)&&hex(expect.binding_sha256)&&team(expect.team_id)
  &&['target','version','purpose'].every(k=>typeof expect[k]==='string'&&!!expect[k])
  &&['locks','required','final_components'].every(k=>object(expect[k])),'Invalid caller-pinned notarization expectations');
 need(typeof doc.target==='string'&&Object.hasOwn(targets,doc.target),`${notarizedMethod} supports only the darwin-arm64 target`);
 need(doc.purpose===purpose,'Private-validation output is never a distribution candidate');
 need(doc.target===expect.target&&doc.version===expect.version&&doc.purpose===expect.purpose,'Envelope differs from the caller-pinned target, version or purpose');
 const s=doc.signing;
 need(keys(s,['mode','team_id','bundle_id'])&&s.mode==='developer-id'&&team(s.team_id)&&typeof s.bundle_id==='string'&&!!s.bundle_id,'Invalid envelope signing identity');
 need(s.team_id===expect.team_id,'Envelope Team differs from the caller-pinned Team');
 const sub=doc.submission,dist=doc.distribution_archive,binding0=doc.signed_binding;
 need(keys(sub,submissionFields),'Invalid notarization submission binding');
 need(keys(dist,distributionFields),'Invalid distribution archive binding');
 need(keys(binding0,bindingRef),'Invalid signed binding reference');
 need(bindingSchemas.includes(binding0.schema),'The signed binding must be omd-final-materials-v1 or omd-final-materials-v2');
 const refs=[['signed binding',binding0],['submission log',sub.log],['uploaded archive',sub.uploaded_archive],['distribution archive',dist.artifact]];
 const folded=new Set();
 for(const [what,r] of refs){
  need(keys(r,r===binding0?bindingRef:ref)&&typeof r.locator==='string'&&r.locator.startsWith('evidence:')&&identity({bytes:r.bytes,sha256:r.sha256}),`Invalid ${what} evidence reference`);
  const p=r.locator.slice('evidence:'.length);
  finalPath(p);
  need(p.split('/').at(-1)!==notarizedName,'Notarized materials cannot reference themselves');
  need(!folded.has(r.locator.toLowerCase()),'Duplicate evidence locator');folded.add(r.locator.toLowerCase());
 }
 need(object(evidenceIdentities)&&same(sorted(evidenceIdentities),[...new Set(refs.map(([,r])=>r.locator))].sort()),'Evidence identities differ from the envelope evidence references');
 for(const [what,r] of refs)need(same(evidenceIdentities[r.locator],{bytes:r.bytes,sha256:r.sha256}),`The ${what} differs from its bound evidence identity`);
 need(binding0.sha256===expect.binding_sha256,'The signed binding differs from the caller-pinned binding digest');
 need(signedBindingBytes instanceof Uint8Array&&sha(signedBindingBytes)===binding0.sha256&&signedBindingBytes.length===binding0.bytes,'Signed binding bytes differ from the bound signed binding');
 const binding=loadStrict(signedBindingBytes);
 need(object(binding)&&binding.schema===binding0.schema,'The signed binding schema differs from its reference');
 // The unchanged original contract on the exact signed payload; it also pins the binding's
 // target, version, locks and components to the caller's expectations.
 validateFinal(binding,initialBytes,signedPayload,delivery,{target:expect.target,version:expect.version,locks:expect.locks,required:expect.required,final_components:expect.final_components});
 need(Object.keys(delivery).every(p=>p.split('/').at(-1)!==notarizedName),'Notarized materials must stay outside the payloads, archives and evidence');
 const bs=binding.signing;
 need(s.mode===bs.mode&&s.team_id===bs.team_id&&s.bundle_id===bs.bundle_id,'Envelope signing identity differs from the signed binding');
 const sp=doc.signed_payload,st=doc.stapled_payload;
 need(keys(sp,inventory),'Invalid signed payload inventory');
 filesMap(sp.files,'signed payload');
 need(sp.inventory_sha256===canonicalInventory(sp.files),'Invalid signed payload inventory');
 need(same(sp.files,binding.payload.files)&&sp.inventory_sha256===binding.payload.inventory_sha256,'The signed payload differs from the signed binding payload');
 need(same(sp.files,signedPayload),'The signed app differs from the bound signed payload');
 const t=doc.ticket;
 need(keys(t,['path','bytes','sha256'])&&integer(t.bytes)&&hex(t.sha256),'Invalid stapled ticket binding');
 need(t.path===ticketPath,'The stapled ticket must be exactly Contents/CodeResources');
 need(t.bytes>0&&t.bytes<=ticketMax,'The stapled ticket size is outside the method bound');
 need(Object.keys(sp.files).every(p=>p.toLowerCase()!==ticketPath.toLowerCase()),'The signed payload already contains the ticket path');
 need(keys(st,inventory),'Invalid stapled payload inventory');
 filesMap(st.files,'stapled payload');
 need(st.inventory_sha256===canonicalInventory(st.files),'Invalid stapled payload inventory');
 for(const p of sorted(sp.files)){
  need(Object.hasOwn(st.files,p),'Stapling removed a signed payload file: '+p);
  need(same(st.files[p],sp.files[p]),'Stapling changed a signed payload file: '+p);
 }
 for(const p of sorted(st.files))need(Object.hasOwn(sp.files,p)||p===ticketPath,'Stapling added a file other than the ticket: '+p);
 need(Object.hasOwn(st.files,ticketPath)&&same(st.files[ticketPath],{bytes:t.bytes,sha256:t.sha256}),'The stapled ticket differs from the stapled payload');
 need(same(st.files,stapledPayload),'The stapled app differs from the bound stapled payload');
 const o=doc.outer_code;
 need(keys(o,['path','slices'])&&o.path==='Contents/MacOS/'+binding.layout.executable&&Array.isArray(o.slices),'Invalid outer code identity');
 need(o.slices.length===1,`${notarizedMethod} supports exactly one outer code slice`);
 const x=o.slices[0];
 need(keys(x,['arch','algorithm','cdhash','code_directory_hash']),'Invalid outer code identity');
 need(x.arch===targets[doc.target]&&x.algorithm==='sha256',`${notarizedMethod} supports only one arm64 SHA-256 outer slice`);
 need(typeof x.cdhash==='string'&&/^[a-f0-9]{40}$/.test(x.cdhash)&&hex(x.code_directory_hash)&&x.cdhash===x.code_directory_hash.slice(0,40),'Invalid outer CodeDirectory identity');
 need(typeof sub.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(sub.id),'The submission id must be a canonical lowercase UUID');
 need(sub.status==='Accepted'&&integer(sub.status_code)&&sub.status_code===0,'The retained submission log binding does not record an accepted submission');
 const app=sub.app_member;
 need(typeof app==='string'&&!app.includes('/')&&app.endsWith('.app')&&app.length>4&&!app.startsWith('.'),'Invalid archive app member');
 finalPath(app);
 need(dist.app_member===app,'The uploaded and distribution archives must contain the same app');
 need(dist.payload_inventory_sha256===st.inventory_sha256,'The distribution archive payload differs from the stapled payload');
 const transports=[['uploaded archive','uploaded',sub.transport,sp.files],['distribution archive','distribution',dist.transport,st.files]];
 for(const [what,,transport,files] of transports){
  need(keys(transport,inventory),`Invalid ${what} transport inventory`);
  filesMap(transport.files,what+' transport',true);
  need(transport.inventory_sha256===canonicalInventory(transport.files),`Invalid ${what} transport inventory`);
  const allowed=described(app,files);
  for(const member of sorted(transport.files))need(allowed.has(member),`Unbound ${what} transport member: ${member}`);
 }
 need(keys(archiveIdentities,['uploaded','distribution']),'Invalid archive observations');
 for(const [what,key,transport,files] of transports){
  const seen=archiveIdentities[key];
  need(keys(seen,['app_member','payload','transport']),'Invalid archive observations');
  need(seen.app_member===app,`The ${what} contains a different app`);
  need(same(seen.payload,files),`The ${what} app differs from its bound payload`);
  need(same(seen.transport,transport.files),`The ${what} transport members differ from their binding`);
 }
 return {schema:notarizedSchema,structure_validated:true,macos_verification_required:true,release_accepted:false};
}
