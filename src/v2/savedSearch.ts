import type {Subscription,DiscoveryQuery} from "./client";
/** Compare applied search inputs without depending on filter selection order. */
export function sameSearch(sub:Subscription,provider:string,input:Record<string,unknown>):boolean {
  if(sub.request.target.provider!==provider||!sub.request.search||sub.request.search.query!==(String(input.query??"").trim()))return false;
  const options=(value:DiscoveryQuery|null|undefined)=>JSON.stringify({filters:Object.fromEntries(Object.entries(value?.filters??{}).filter(([,v])=>v.length).sort(([a],[b])=>a.localeCompare(b)).map(([key,values])=>[key,[...new Set(values)].sort()])),sort:value?.sort??null,feed:value?.feed??null});
  const languages=(value:string[])=>JSON.stringify([...new Set(value)].sort());
  return options(sub.request.search.discovery)===options(input.discovery as DiscoveryQuery)&&languages(sub.request.policy.languages ?? [])===languages((input.policy as {languages?:string[]})?.languages??[]);
}
