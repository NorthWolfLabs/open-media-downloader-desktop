/** Coalesce event bursts without postponing refresh forever during a long job. */
export class ResourceInvalidation {
  private pending=new Set<string>();
  private timer:ReturnType<typeof setTimeout>|undefined;
  private flushing=false;
  private disposed=false;
  constructor(private refresh:(resource:string)=>Promise<void>,private failure:(error:unknown)=>void,private delay=300){}
  add(...resources:string[]){if(this.disposed)return;for(const resource of resources)this.pending.add(resource);this.schedule();}
  private schedule(){if(!this.disposed&&!this.flushing&&this.timer===undefined&&this.pending.size)this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},this.delay);}
  private async flush(){this.flushing=true;const resources=[...this.pending];this.pending.clear();
    try{for(const resource of resources){if(this.disposed)break;try{await this.refresh(resource);}catch(e){this.failure(e);}}}
    finally{this.flushing=false;this.schedule();}
  }
  dispose(){this.disposed=true;clearTimeout(this.timer);this.pending.clear();}
}
