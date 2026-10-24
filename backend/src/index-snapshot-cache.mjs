// Cache only within one database revision. A new checkpoint or rollback invalidates it.
export class IndexSnapshotCache {
  constructor(limit=32){this.limit=limit;this.revision=null;this.entries=new Map();}
  async read(revision,key,load){
    if(this.revision!==revision){this.entries.clear();this.revision=revision;}
    let pending=this.entries.get(key);
    if(!pending){
      pending=Promise.resolve().then(load);
      this.entries.set(key,pending);
      while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);
      pending.catch(()=>{if(this.entries.get(key)===pending)this.entries.delete(key);});
    }
    return structuredClone(await pending);
  }
}
