import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate} from './materials-contract.mjs';
const f=JSON.parse(await readFile(new URL('../packaging/materials-contract-fixtures-v1.json',import.meta.url)));
for(const c of f.cases)test(c.name,()=>{const run=()=>validate(c.manifest,c.files,f.required,f.target,f.version,f.locks);if(c.valid)assert.equal(run().coverage_validated,true);else assert.throws(run);});

for(const c of f.native.cases)test(c.name,async()=>{
 const {validateNativeReceipt}=await import('./materials-contract.mjs'),n=f.native,r=structuredClone(n.receipt);
 for(const key of c.remove??[])delete r[key];
 for(const [key,value] of Object.entries(c.set??{})){const parts=key.split('.');let current=r;for(const part of parts.slice(0,-1))current=current[part];current[parts.at(-1)]=value;}
 const run=()=>validateNativeReceipt(r,n.files,n.names,n.lock,n.target,Buffer.from(c.notice_text??n.notice_text),n.version);
 if(c.valid)run();else assert.throws(run);
});
