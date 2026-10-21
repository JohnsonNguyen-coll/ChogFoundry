import {AppError} from './validation.mjs';

// Independent snapshots may run together; bound RPC pressure and waiting time.
export class ReadQueue {
  constructor({concurrency=4,capacity=24,timeoutMs=10000}={}) {
    this.concurrency=concurrency;this.capacity=capacity;this.timeoutMs=timeoutMs;
    this.active=0;this.waiting=[];this.closed=false;
  }
  acquire() {
    if(this.closed)return Promise.reject(new AppError(503,'READER_CLOSED','The chain reader is restarting. Please retry.'));
    if(this.active<this.concurrency){this.active++;return Promise.resolve(this.releaseSlot());}
    if(this.waiting.length>=this.capacity)return Promise.reject(new AppError(503,'READER_CAPACITY','Onchain reads are at capacity. Please retry shortly.'));
    return new Promise((resolve,reject)=>{
      const entry={resolve,reject,timer:null};
      entry.timer=setTimeout(()=>{
        this.waiting=this.waiting.filter(item=>item!==entry);
        reject(new AppError(503,'READER_WAIT_TIMEOUT','Onchain reads are taking longer than usual. Please retry.'));
      },this.timeoutMs);
      this.waiting.push(entry);
    });
  }
  releaseSlot() {
    let released=false;
    return ()=>{
      if(released)return;released=true;this.active--;
      const next=this.waiting.shift();
      if(next){clearTimeout(next.timer);this.active++;next.resolve(this.releaseSlot());}
    };
  }
  close() {
    this.closed=true;
    for(const entry of this.waiting){clearTimeout(entry.timer);entry.reject(new AppError(503,'READER_CLOSED','The chain reader is restarting. Please retry.'));}
    this.waiting=[];
  }
}
