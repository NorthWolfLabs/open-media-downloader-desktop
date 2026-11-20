import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateFinal,canonicalInventory} from './final-materials-contract.mjs';
// Byte-identical to the engine's distribution/final-materials-fixtures-v1.json and -v2.json.
// The pinned digests make any unsynchronized fixture change fail here and in the engine tests.
const pinned={1:'e14f2ad5155bf1fe6e3b7a4c9f6e45eebf5cf2924d1967c1eee87fe19a1a0da7',2:'07df65c1fd87609306f2af1e86be0a2886007e6af574a4b91f2584ab96f3b923'};
for(const version of [1,2]){
 const raw=await readFile(new URL(`../packaging/final-materials-fixtures-v${version}.json`,import.meta.url));
 const f=JSON.parse(raw);
 const apply=edits=>{
  const s=structuredClone(f.base);
  for(const e of edits){
   if(e.target==='initial'){s.initial=e.value;continue;}
   let current=s[e.target];
   for(const part of e.path.slice(0,-1))current=current[part];
   if(e.delete)delete current[e.path.at(-1)];else current[e.path.at(-1)]=structuredClone(e.value);
  }
  return s;
 };
 test(`v${version} fixtures are the pinned shared copy`,()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),pinned[version]);
  assert.equal(f.schema,`omd-final-materials-contract-fixtures-v${version}`);
 });
 // Historical evidence: bindings made before the macOS sign-in window became an app bundle carry
 // it as a plain bin/omd-signin. Derived from the shared nested-bundle case (the shared fixture
 // files stay byte-identical with the engine's), it must validate from its own recorded layout.
 const legacy=()=>{
  const s=apply(f.cases.find(c=>c.name==='nested-sign-in-bundle').edits),doc=s.doc,res=doc.layout.resources;
  const bundle='bin/OMD Sign-In.app/',helper=bundle+'Contents/MacOS/omd-signin';
  const flatten=(map,prefix='')=>{if(!map)return;for(const k of Object.keys(map))if(k.startsWith(prefix+bundle)){if(k===prefix+helper)map[prefix+'bin/omd-signin']=map[k];delete map[k];}};
  for(const map of [doc.input.files,doc.payload.files,s.payload,doc.relations,doc.layout.code,...doc.components.map(c=>c.artifacts)])flatten(map,res+'/');
  const initial=JSON.parse(s.initial);for(const c of initial.components)flatten(c.artifacts);
  s.initial=JSON.stringify(initial,null,2)+'\n';
  const bytes=Buffer.byteLength(s.initial),sha256=createHash('sha256').update(s.initial).digest('hex'),v1=res+'/third-party/materials-v1.json';
  for(const map of [doc.input.files,doc.payload.files,s.payload])map[v1]={bytes,sha256};
  Object.assign(doc.relations[v1],{before:sha256,after:sha256});
  for(const c of doc.components)if(c.artifacts[v1])c.artifacts[v1]={initial:sha256,final:sha256};
  Object.assign(doc.initial_review,{bytes,sha256});
  doc.relations['Contents/_CodeSignature/CodeResources'].sealed_files=Object.keys(doc.payload.files).length-3;
  doc.input.inventory_sha256=canonicalInventory(doc.input.files);doc.payload.inventory_sha256=canonicalInventory(doc.payload.files);
  assert.ok(doc.layout.code[res+'/bin/omd-signin']&&!JSON.stringify(s).includes('Sign-In.app'));
  return s;
 };
 const runState=s=>validateFinal(s.doc,Buffer.from(s.initial,'utf8'),s.payload,s.delivery,s.expect);
 test(`v${version} a historical binding with a plain bin/omd-signin validates from its recorded layout`,()=>{
  assert.deepEqual(runState(legacy()),{schema:`omd-final-materials-v${version}`,coverage_validated:true,distribution_candidate:true,release_accepted:false});
 });
 test(`v${version} a historical binding still refuses a receipt of the unsigned sign-in helper`,()=>{
  const s=legacy();s.doc.receipts.engine.artifacts['omd-signin']=s.doc.input.files[s.doc.layout.resources+'/bin/omd-signin'].sha256;
  assert.throws(()=>runState(s),/Engine receipt does not bind the final payload/);
 });
 for(const c of f.cases)test(`v${version} ${c.name}`,()=>{
  const s=apply(c.edits),run=()=>validateFinal(s.doc,Buffer.from(s.initial,'utf8'),s.payload,s.delivery,s.expect);
  if(c.valid)assert.deepEqual(run(),{schema:`omd-final-materials-v${version}`,coverage_validated:true,distribution_candidate:true,release_accepted:false});
  else assert.throws(run,error=>error instanceof Error&&error.message.includes(c.error),c.error);
 });
}
