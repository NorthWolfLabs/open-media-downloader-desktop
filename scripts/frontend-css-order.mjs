// Build gate for the frontend stylesheet order. Global rules in style.css (for example
// `.picker-row .choice-picker`) tie on specificity with component rules and win only by
// coming later, so the bundle must be one stylesheet with every scoped component rule
// before the first global rule (the first rule of src/v2/ui/tokens.css).
export const GLOBAL_START=':root,:root[data-appearance=linux]{';
const SCOPED=/\.svelte-[a-z0-9]+/g;

/** @param {[name: string, text: string][]} assets */
export function checkCssOrder(assets){
 const css=assets.filter(([name])=>name.endsWith('.css'));
 if(css.length!==1)throw new Error(`Expected one bundled stylesheet, found ${css.length}: ${css.map(([name])=>name).join(', ')||'none'}`);
 const [name,text]=css[0];
 const start=text.indexOf(GLOBAL_START);
 if(start<0||text.indexOf(GLOBAL_START,start+1)>=0)throw new Error(`${name} must contain the global token rule exactly once`);
 const scoped=[...text.matchAll(SCOPED)];
 if(!scoped.length)throw new Error(`${name} has no component styles`);
 const late=scoped.find(match=>(match.index??-1)>start);
 if(late)throw new Error(`${name} has the component rule ${late[0]} after the global stylesheets; keep App before the global CSS imports in src/v2/boot.ts`);
 return {name,componentEnd:scoped[scoped.length-1].index??-1,globalStart:start};
}

/** @returns {import('vite').Plugin} */
export function frontendCssOrder(){
 // post: Vite emits the extracted stylesheet in its own generateBundle step first.
 return {name:'omd-css-order',apply:'build',enforce:'post',generateBundle(_options,bundle){
  /** @type {[string, string][]} */
  const assets=Object.values(bundle).flatMap(item=>item.type==='asset'?[[item.fileName,String(item.source)]]:[]);
  try{checkCssOrder(assets);}
  catch(error){this.error(error instanceof Error?error.message:String(error));}
 }};
}
