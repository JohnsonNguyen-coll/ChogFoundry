const gateways=['https://ipfs.io/ipfs/','https://gateway.pinata.cloud/ipfs/','https://ipfs.4everland.io/ipfs/','https://dweb.link/ipfs/'];
export function mediaUrls(value){
  if(typeof value!=='string'||value.length>1048576)return [];
  if(/^data:image\/(png|jpeg|webp|gif|avif|svg\+xml)[;,]/i.test(value))return [value];
  let path;
  if(value.startsWith('ipfs://'))path=value.slice(7).replace(/^ipfs\//,'');
  else try{
    const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return [];
    const subdomain=url.hostname.match(/^([a-z0-9]+)\.ipfs\./i);
    if(subdomain)path=subdomain[1]+url.pathname;
    else if(url.pathname.startsWith('/ipfs/'))path=url.pathname.slice(6);
    else return [url.href];
  }catch{return [];}
  if(!/^[a-zA-Z0-9]+(?:\/[^?#]*)?$/.test(path)||path.split('/').includes('..'))return [];
  return [...new Set([...gateways.map(base=>base+path),...(value.startsWith('https:')?[value]:[])])];
}
export async function readNftMetadata(uri,signal){
  if(typeof uri!=='string')throw new Error('NFT metadata is unavailable.');
  if(uri.startsWith('data:application/json')){
    if(uri.length>524288)throw new Error('NFT metadata exceeds the size limit.');
    const comma=uri.indexOf(','),body=uri.slice(comma+1);
    return JSON.parse(uri.slice(0,comma).includes(';base64')?new TextDecoder().decode(Uint8Array.from(atob(body),c=>c.charCodeAt(0))):decodeURIComponent(body));
  }
  const urls=mediaUrls(uri);
  // Race real gateways: one slow/unavailable gateway must not hide the NFT.
  const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(12000)]);
  try{return await Promise.any(urls.map(async url=>{
    const r=await fetch(url,{signal:combined,credentials:'omit',referrerPolicy:'no-referrer',headers:{accept:'application/json'}});
    if(!r.ok)throw new Error('Metadata gateway unavailable.');
    const text=await r.text();if(text.length>524288)throw new Error('Metadata too large.');
    const result=JSON.parse(text);if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('Invalid metadata.');return result;
  }));}catch{throw new Error('NFT metadata gateways are unavailable. Retry to load the original artwork.');}
  finally{controller.abort();}
}
