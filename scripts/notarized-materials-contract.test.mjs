import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateNotarized,loadStrict} from './notarized-materials-contract.mjs';
// Byte-identical to the engine's distribution/notarized-materials-fixtures-v1.json; the pinned
// digest makes any unsynchronized change fail here and in the engine tests. Messages must be
// identical to the engine's, not merely similar. The final-materials fixtures it composes stay
// pinned and unchanged in final-materials-contract.test.mjs.
const pinned='f1adf252720868eb5542ecf9f1763be1df2230a48ec2227cfe8add9a500f554a';
const raw=await readFile(new URL('../packaging/notarized-materials-fixtures-v1.json',import.meta.url));
const f=JSON.parse(raw);
const apply=(base,edits)=>{
 const s=structuredClone(f.bases[base]);
 for(const e of edits){
  if(e.target==='binding'||e.target==='initial'){s[e.target]=e.value;continue;}
  let current=s[e.target];
  for(const part of e.path.slice(0,-1))current=current[part];
  if(e.delete)delete current[e.path.at(-1)];else current[e.path.at(-1)]=structuredClone(e.value);
 }
 return s;
};
test('notarized fixtures are the pinned shared copy',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),pinned);
 assert.equal(f.schema,'omd-notarized-materials-contract-fixtures-v1');
 assert.ok(f.cases.length>=100&&f.loader.length>=25);
});
for(const c of f.cases)test(`notarized ${c.name}`,()=>{
 const s=apply(c.base,c.edits);
 const run=()=>validateNotarized(s.doc,Buffer.from(s.binding,'utf8'),Buffer.from(s.initial,'utf8'),s.signed_payload,s.stapled_payload,s.delivery,s.archives,s.evidence,s.expect);
 // Structural success never promotes anything: a fresh macOS verification is always required.
 if(c.valid)assert.deepEqual(run(),{schema:'omd-notarized-materials-v1',structure_validated:true,macos_verification_required:true,release_accepted:false});
 else assert.throws(run,error=>error instanceof Error&&error.message===c.error,c.error);
});
for(const c of f.loader)test(`strict loader ${c.name}`,()=>{
 const run=()=>loadStrict(Buffer.from(c.raw_hex,'hex'));
 if(c.valid)run();else assert.throws(run,error=>error instanceof Error&&error.message===c.error,c.error);
});
test('JSON.parse alone would accept duplicate keys that the strict loader refuses',()=>{
 const text='{"release_accepted":false,"release_accepted":true}';
 assert.equal(JSON.parse(text).release_accepted,true);
 assert.throws(()=>loadStrict(Buffer.from(text)),/Duplicate JSON key/);
});
