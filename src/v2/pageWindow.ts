import type {Page} from './client';
/** Refresh a loaded prefix without dropping later pages on a resource event. */
export async function pageWindow<T>(load:(cursor:string|null)=>Promise<Page<T>>,minimum:number):Promise<Page<T>>{
  const items:T[]=[];let cursor:string|null=null;const seen=new Set<string>();
  do{const page=await load(cursor);items.push(...page.items);cursor=page.next_cursor;
    if(cursor){if(seen.has(cursor))throw new Error('OMD received the same page twice. Refresh this list.');seen.add(cursor);}
  }while(cursor&&items.length<Math.max(1,minimum));
  return {items,next_cursor:cursor};
}
