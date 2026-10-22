import {AppError} from './validation.mjs';

// Prove every bounded log range is empty before skipping expensive state reads.
// A launch, transfer, trade or graduation emits a log at one of these addresses.
export async function quietMarketEnd(provider,addresses,start,target,chunkSize=100){
  const allowed=new Set(addresses.map(a=>a.toLowerCase()));
  const ranges=Array.from({length:Math.min(64,Math.ceil((target-start+1)/chunkSize))},(_,i)=>({start:start+i*chunkSize,end:Math.min(start+(i+1)*chunkSize-1,target)}));
  let end=start-1;
  for(let i=0;i<ranges.length;i+=8){
    const batch=ranges.slice(i,i+8);
    const logs=await Promise.all(batch.map(r=>provider.getLogs({address:[...allowed],fromBlock:r.start,toBlock:r.end})));
    for(let j=0;j<batch.length;j++){
      const range=batch[j];
      if(logs[j].some(log=>log.removed||!allowed.has(log.address.toLowerCase())||log.blockNumber<range.start||log.blockNumber>range.end))throw new AppError(503,'CHAIN_REORG','Quiet market log range could not be verified.');
      if(logs[j].length)return end;
      end=range.end;
    }
  }
  return end;
}
