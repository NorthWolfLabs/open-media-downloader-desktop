import type {components} from './client';
type Session=components['schemas']['Session'];
/** Netscape cookie exports are a deliberate import, never read from browser profiles. */
export function importCookies(text:string, hosts?:string[], now=Math.floor(Date.now()/1000)):Session {
  if(new TextEncoder().encode(text).length>1024*1024)throw new Error('The cookie file is larger than 1 MB.');
  const cookies:Session['cookies']=[];
  for(const [index,original] of text.split(/\r?\n/).entries()){
    const line=original.startsWith('#HttpOnly_')?original.slice(10):original;
    if(!line.trim()||line.startsWith('#'))continue;
    const parts=line.split('\t');
    // Errors identify the line, never include credential bytes.
    if(parts.length!==7||!['TRUE','FALSE'].includes(parts[1])||!['TRUE','FALSE'].includes(parts[3])||!/^\d+$/.test(parts[4]))throw new Error(`This isn’t a cookies.txt file (line ${index+1} doesn’t match).`);
    const [domain,subdomains,path,,expiry,name,value]=parts;
    const expires=Number(expiry);
    if(!Number.isSafeInteger(expires)||!domain||!name||!path.startsWith('/'))throw new Error(`Invalid cookie fields on line ${index+1}.`);
    if(hosts){
      const normalized=domain.replace(/^\./,'').toLowerCase();
      // Match the cookie's domain itself against reviewed credential grants.
      // Never widen authority from a child host to its parent domain.
      const allowed=hosts.some(host=>host.startsWith('*.')
        ? normalized.endsWith(host.slice(1).toLowerCase()) && normalized!==host.slice(2).toLowerCase()
        : normalized===host.toLowerCase());
      if(!allowed || (expires!==0 && expires<=now))continue;
    }
    cookies.push({domain:domain.replace(/^\./,''),host_only:subdomains==='FALSE',path,name,value,expires_at:expires===0?null:expires});
    if(cookies.length>512)throw new Error('A source account can contain at most 512 cookies.');
  }
  if(!cookies.length)throw new Error(hosts?'The file contains no unexpired cookies for this source. Sign in and export a fresh file.':'The file contains no cookies.');
  return {expires_at:null,cookies,headers:[]};
}
