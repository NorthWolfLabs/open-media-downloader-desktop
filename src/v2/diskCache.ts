// Disposable display data in WebKit's profile-local IndexedDB. Separate small
// indexes prevent eviction scans from loading hundreds of megabytes of blobs.
type DiskKind='metadata'|'artwork';
type Index={key:string;kind:DiskKind;bytes:number;expires:number;used:number};
type DiskValue<T>={value:T;expires:number};
const MiB=1024*1024;
export function diskLimit() { try { const n=Number(localStorage.getItem('omd.display-cache-mib'));return [256,512,1024].includes(n)?n:512; }catch{return 512;} }
class DisplayDiskCache {
  private writes=new Set<Promise<void>>();
  private opening:Promise<IDBDatabase|undefined>|undefined;
  constructor(private name='omd-display-cache-v1',private limits=()=>({bytes:diskLimit()*MiB,metadata:32*MiB,entries:5000})){}
  private open() {
    return this.opening??=(new Promise<IDBDatabase|undefined>(resolve=>{
      if(!globalThis.indexedDB){resolve(undefined);return;}
      let settled=false;const finish=(db?:IDBDatabase)=>{if(settled){db?.close();return;}settled=true;clearTimeout(timer);resolve(db);};
      const timer=setTimeout(()=>finish(),250);
      try {
        const request=indexedDB.open(this.name,1);
        request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('meta',{keyPath:'key'});db.createObjectStore('data');};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opening=undefined;};finish(db);};
        request.onerror=()=>finish();request.onblocked=()=>finish();
      }catch{finish();}
    }));
  }
  async read<T>(key:string|null):Promise<DiskValue<T>|undefined> {
    if(!key)return;
    return this.bounded(async()=>{
      const db=await this.open();if(!db)return;
      return new Promise<DiskValue<T>|undefined>(resolve=>{
        try {
          const tx=db.transaction(['meta','data'],'readonly'),m=tx.objectStore('meta').get(key),d=tx.objectStore('data').get(key);
          tx.oncomplete=()=>{
            const meta=m.result as Index|undefined;
            if(!meta||d.result===undefined){resolve(undefined);return;}
            let value=d.result;
            if(value && value.artworkBytes instanceof ArrayBuffer)value={blob:new Blob([value.artworkBytes],{type:value.artworkType}),ratio:value.ratio};
            resolve({value:value as T,expires:meta.expires});
            try{const touch=db.transaction('meta','readwrite');touch.objectStore('meta').put({...meta,used:Date.now()});}catch{}
          };tx.onerror=tx.onabort=()=>resolve(undefined);
        }catch{resolve(undefined);}
      });
    });
  }
  write(key:string|null,kind:DiskKind,value:unknown,bytes:number,expires:number) {
    const job=this.put(key,kind,value,bytes,expires);this.writes.add(job);void job.finally(()=>this.writes.delete(job));return job;
  }
  async flush(){await Promise.allSettled([...this.writes]);}
  private async put(key:string|null,kind:DiskKind,value:unknown,bytes:number,expires:number) {
    if(!key||!Number.isFinite(bytes)||bytes<0||bytes>(kind==='metadata'?2:8)*MiB)return;
    if(kind==='artwork' && value && typeof value==='object' && 'blob' in value && value.blob instanceof Blob){const entry=value as {blob:Blob;ratio:number};try{value={artworkBytes:await entry.blob.arrayBuffer(),artworkType:entry.blob.type,ratio:entry.ratio};}catch{return;}}
    const db=await this.open();if(!db)return;
    await new Promise<void>(resolve=>{try {
      const tx=db.transaction(['meta','data'],'readwrite');
      tx.onerror=tx.onabort=()=>resolve();tx.oncomplete=()=>resolve();
      tx.objectStore('data').put(value,key);
      tx.objectStore('meta').put({key,kind,bytes,expires,used:Date.now()} satisfies Index);
      this.trimTransaction(tx);
    }catch{resolve();} });
  }
  private trimTransaction(tx:IDBTransaction) {
    const m=tx.objectStore('meta'),d=tx.objectStore('data'),r=m.getAll();
    r.onsuccess=()=>{
      const rows=(r.result as Index[]).sort((a,b)=>a.used-b.used),limits=this.limits();
      let total=rows.reduce((n,r)=>n+r.bytes,0),metadata=rows.filter(r=>r.kind==='metadata').reduce((n,r)=>n+r.bytes,0),count=rows.length;
      for(const row of rows){
        const expired=row.expires<Date.now()-24*60*60_000;
        if(expired||total>limits.bytes||count>limits.entries||(row.kind==='metadata'&&metadata>limits.metadata)){
          m.delete(row.key);d.delete(row.key);total-=row.bytes;if(row.kind==='metadata')metadata-=row.bytes;count--;
        }
      }
    };
  }
  async trim(){const db=await this.open();if(db)try{this.trimTransaction(db.transaction(['meta','data'],'readwrite'));}catch{}}
  async clear(){await this.flush();const db=await this.open();if(!db)return;await new Promise<void>(resolve=>{try{const tx=db.transaction(['meta','data'],'readwrite');tx.objectStore('meta').clear();tx.objectStore('data').clear();tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>resolve();}catch{resolve();}});}
  async usage(){const result=await this.bounded(async()=>{const db=await this.open();if(!db)return;return new Promise<{bytes:number;entries:number}>(resolve=>{const tx=db.transaction('meta','readonly'),r=tx.objectStore('meta').getAll();tx.oncomplete=()=>resolve({bytes:(r.result as Index[]).reduce((n,r)=>n+r.bytes,0),entries:r.result.length});tx.onerror=()=>resolve({bytes:0,entries:0});});});return result??{bytes:0,entries:0};}
  private async bounded<T>(work:()=>Promise<T>):Promise<T|undefined>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work().catch(()=>undefined),new Promise<undefined>(resolve=>timer=setTimeout(()=>resolve(undefined),100))]);}finally{clearTimeout(timer);}}
}
export const displayDisk=new DisplayDiskCache();
