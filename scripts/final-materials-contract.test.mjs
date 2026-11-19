import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateFinal} from './final-materials-contract.mjs';
// Byte-identical to the engine's distribution/final-materials-fixtures-v1.json and -v2.json.
// The pinned digests make any unsynchronized fixture change fail here and in the engine tests.
const pinned={1:'6c07008986773c2583d6ee2466db2acc86cd07953b9fbf249d517669f2f516ca',2:'fa191ccd7529e2b4386c5433611ff2c3959776335ffafbb1de81c0206c6ed08e'};
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
 for(const c of f.cases)test(`v${version} ${c.name}`,()=>{
  const s=apply(c.edits),run=()=>validateFinal(s.doc,Buffer.from(s.initial,'utf8'),s.payload,s.delivery,s.expect);
  if(c.valid)assert.deepEqual(run(),{schema:`omd-final-materials-v${version}`,coverage_validated:true,distribution_candidate:true,release_accepted:false});
  else assert.throws(run,error=>error instanceof Error&&error.message.includes(c.error),c.error);
 });
}
