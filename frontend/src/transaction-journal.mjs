// Public transaction evidence only; never wallet secrets or authority.
const key='chog-foundry-mainnet-transactions-v1';
let entries=[];
try{const saved=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))entries=saved.filter(x=>/^0x[0-9a-fA-F]{64}$/.test(x.hash)&&x.transaction?.chainId==='143'&&/^0x[0-9a-fA-F]{40}$/.test(x.transaction.from)&&/^0x[0-9a-fA-F]{40}$/.test(x.transaction.to)&&/^0x[0-9a-fA-F]+$/.test(x.transaction.data)).slice(-20);}catch{}
const listeners=new Set();
export function transactions(){return entries;}
export function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
function publish(){try{sessionStorage.setItem(key,JSON.stringify(entries));}catch{}for(const listener of listeners)listener();}
export function pendingFor(wallet){return entries.some(x=>x.transaction.from.toLowerCase()===wallet?.toLowerCase()&&!['finalized','reverted','replaced-finalized'].includes(x.status));}
export function recordTransaction(result){entries=[...entries,{...result,status:'submitted'}].slice(-20);publish();}
export function updateTransaction(hash,state){entries=entries.map(x=>x.hash===hash?{...x,...state}:x);publish();}
