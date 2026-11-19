import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GLOBAL_START,checkCssOrder} from './frontend-css-order.mjs';

const desktop=join(dirname(fileURLToPath(import.meta.url)),'..');
const scoped='.choice-picker.svelte-abc12{display:grid}';
const global=`${GLOBAL_START}color:red}.picker-row .choice-picker{display:grid}`;

test('one stylesheet with component rules before the global sheets passes',()=>{
 assert.deepEqual(checkCssOrder([['assets/style-a.css',scoped+global],['assets/main.js','x']]),{name:'assets/style-a.css',componentEnd:14,globalStart:scoped.length});
});

test('a component rule after the global sheets or a split stylesheet is refused',()=>{
 assert.throws(()=>checkCssOrder([['assets/style-a.css',global+scoped]]),/\.svelte-abc12 after the global stylesheets/);
 assert.throws(()=>checkCssOrder([['assets/main.css',global],['assets/App.css',scoped]]),/Expected one bundled stylesheet, found 2/);
 assert.throws(()=>checkCssOrder([['assets/style-a.css',scoped]]),/global token rule exactly once/);
 assert.throws(()=>checkCssOrder([['assets/style-a.css',global]]),/no component styles/);
});

test('the gate matches the sources it guards',async()=>{
 // The marker is the first rule of tokens.css, minified.
 const tokens=await readFile(join(desktop,'src/v2/ui/tokens.css'),'utf8');
 const first=tokens.replace(/\/\*[\s\S]*?\*\//g,'').trim();
 assert.ok(first.replace(/\s+/g,'').replaceAll('"','').startsWith(GLOBAL_START),'tokens.css must start with the marker rule');
 // App comes before the global sheets, and main.ts loads no stylesheet itself.
 const boot=await readFile(join(desktop,'src/v2/boot.ts'),'utf8');
 const order=['./App.svelte','./ui/tokens.css','./ui/foundation.css','./style.css'].map(name=>boot.indexOf(`"${name}"`));
 assert.ok(order.every(index=>index>=0)&&order.every((index,i)=>!i||index>order[i-1]),'boot.ts must import App, then tokens, foundation and style');
 assert.doesNotMatch(await readFile(join(desktop,'src/v2/main.ts'),'utf8'),/\.css["']/);
 const config=await readFile(join(desktop,'vite.v2.config.ts'),'utf8');
 assert.match(config,/cssCodeSplit:\s*false/);
 assert.match(config,/frontendCssOrder\(\)/);
});
