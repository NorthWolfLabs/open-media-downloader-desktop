import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {frontendNotices} from './frontend-notices.mjs';

test('emitted modules select full texts, preserve dual attribution, and exclude unused packages',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'omd-notices-')),old=process.cwd();
 try{
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({packages:{'node_modules/used':{version:'1'},'node_modules/unused':{version:'1'}}}));
  for(const name of ['used','unused']){const home=path.join(root,'node_modules',name);fs.mkdirSync(home,{recursive:true});fs.writeFileSync(path.join(home,'package.json'),JSON.stringify({name,version:'1'}));fs.writeFileSync(path.join(home,'LICENSE'),'ISC full text\nFeather MIT full text\n');fs.writeFileSync(path.join(home,'index.js'),'');}
  process.chdir(root);const assets=[],plugin=frontendNotices();plugin.emitFile=x=>assets.push(x);plugin.error=x=>{throw Error(x);};
  plugin.generateBundle({}, {'app.js':{type:'chunk',code:'emitted',modules:{[path.join(root,'node_modules/used/index.js')]:{}}}});
  const receipt=JSON.parse(assets[1].source);assert.deepEqual(receipt.packages.map(x=>x.name),['used']);assert.match(assets[0].source,/ISC full text\nFeather MIT full text/);assert.equal(receipt.pending.length,0);
  fs.writeFileSync(path.join(root,'package-lock.json'),'{}');assert.throws(()=>plugin.generateBundle({}, {'app.js':{type:'chunk',code:'emitted',modules:{[path.join(root,'node_modules/used/index.js')]:{}}}}),/differs from lock/);
  fs.unlinkSync(path.join(root,'node_modules/used/LICENSE'));
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({packages:{'node_modules/used':{version:'1'},'node_modules/unused':{version:'1'}}}));
  const icons=path.join(root,'node_modules/used/dist/icons');fs.mkdirSync(icons,{recursive:true});
  fs.writeFileSync(path.join(icons,'copyright.js'),'export { CopyrightIcon };');
  fs.writeFileSync(path.join(icons,'copyright.svelte'),'<!-- Copyright icon; auxiliary ISC attribution does not retain Feather MIT -->');
  assert.throws(()=>plugin.generateBundle({}, {'app.js':{type:'chunk',code:'emitted',modules:{[path.join(root,'node_modules/used/index.js')]:{}}}}),/missing installed full texts/);
  fs.writeFileSync(path.join(root,'node_modules/used/LICENSE'),'   \n');
  assert.throws(()=>plugin.generateBundle({}, {'app.js':{type:'chunk',code:'emitted',modules:{[path.join(root,'node_modules/used/index.js')]:{}}}}),/missing installed full texts/);
 }finally{process.chdir(old);fs.rmSync(root,{recursive:true});}
});

test('virtual helpers use the active Vite+ provider rather than unrelated project Vite',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'omd-builder-notices-')),old=process.cwd();
 try{
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({packages:{'node_modules/vite':{version:'7.3.6'}}}));
  const home=path.join(root,'managed-builder');fs.mkdirSync(path.join(home,'dist/vite/node'),{recursive:true});
  const entry=path.join(home,'dist/vite/node/cli.js');fs.writeFileSync(entry,'builder entry');
  fs.writeFileSync(path.join(home,'package.json'),JSON.stringify({name:'@voidzero-dev/vite-plus-core',version:'0.2.1',bundledVersions:{vite:'8.0.16'}}));
  fs.writeFileSync(path.join(home,'LICENSE'),'Full Vite+ and bundled Vite license texts');
  process.chdir(root);const p=frontendNotices({builderEntry:entry}),assets=[];p.meta={viteVersion:'8.0.16'};p.emitFile=x=>assets.push(x);p.error=x=>{throw Error(x);};
  const bundle={'app.js':{type:'chunk',code:'output',modules:{'\0vite/modulepreload-polyfill.js':{}}}};
  p.generateBundle({},bundle);
  const receipt=JSON.parse(assets[1].source);
  assert.equal(receipt.builder.version,'0.2.1');assert.equal(receipt.builder.runtime_vite_version,'8.0.16');assert.equal(receipt.builder.project_locked,false);
  assert.deepEqual(receipt.packages.map(x=>x.name),['@voidzero-dev/vite-plus-core']);assert.match(assets[0].source,/Full Vite\+ and bundled Vite license texts/);
  p.meta={viteVersion:'9.0.0'};assert.throws(()=>p.generateBundle({},bundle),/does not match/);
 }finally{process.chdir(old);fs.rmSync(root,{recursive:true});}
});
