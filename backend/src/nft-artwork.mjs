import {AppError,tokenId} from './validation.mjs';

const gateways=['https://gateway.pinata.cloud/ipfs/','https://ipfs.4everland.io/ipfs/'];
export function nftIpfsUrls(value){
  if(typeof value!=='string'||value.length>4096)return [];
  let path;
  if(value.startsWith('ipfs://'))path=value.slice(7).replace(/^ipfs\//,'');
  else try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)return [];const sub=url.hostname.match(/^([a-z0-9]+)\.ipfs\./i);if(sub)path=sub[1]+url.pathname;else if(url.pathname.startsWith('/ipfs/'))path=url.pathname.slice(6);else return [];}catch{return [];}
  if(!/^[a-zA-Z0-9]+(?:\/[^?#]*)?$/.test(path)||path.split('/').some(p=>p==='..'||p==='.'))return [];
  const slash=path.indexOf('/'),cid=slash<0?path:path.slice(0,slash),suffix=slash<0?'':path.slice(slash);
  return [`https://${cid}.ipfs.w3s.link${suffix}`,`https://${cid}.ipfs.dweb.link${suffix}`,...gateways.map(base=>base+path)];
}
export function originalNftImage(html,collection,id){
  const expected=`https://opensea.io/item/monad/${collection.toLowerCase()}/${id}`;
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let parsed;try{parsed=JSON.parse(match[1]);}catch{continue;}
    const entries=Array.isArray(parsed)?parsed:parsed?.['@graph']||[parsed];
    for(const item of entries){
      if(item?.['@type']!=='Product'||String(item.sku)!==id||item.url?.toLowerCase()!==expected)continue;
      const image=typeof item.image==='string'?item.image:item.image?.url;
      try{const url=new URL(image);if(url.protocol==='https:'&&!url.username&&!url.password&&['i2c.seadn.io','i2.seadn.io','i.seadn.io'].includes(url.hostname)&&url.pathname.toLowerCase().startsWith(`/monad/${collection.toLowerCase()}/`))return url.href;}catch{}
    }
  }
  throw Error('ORIGINAL_IMAGE_UNAVAILABLE');
}
async function boundedBytes(response,limit){
  if(!response.ok)throw Error('REMOTE_UNAVAILABLE');
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>limit)throw Error('REMOTE_TOO_LARGE');chunks.push(chunk);}
  return Buffer.concat(chunks);
}

// Reads only configured NFT metadata and fixed public gateways/CDNs, never a user URL proxy.
export function nftArtworkReader(collection,{fetchImage=fetch,readTokenURI,ttlMs=300000,maxBytes=32*1024*1024}={}) {
  const cache=new Map(),pending=new Map();let size=0;
  return async input=>{
    const id=String(tokenId(input)),cached=cache.get(id);
    if(cached&&cached.expires>Date.now())return cached;
    if(pending.has(id))return pending.get(id);
    if(pending.size>=8)throw new AppError(503,'ARTWORK_BUSY','Images are loading. Please try again shortly.');
    const request=Promise.resolve().then(async()=>{
      const lifetime=new AbortController();
      const remote=(url,options)=>fetchImage(url,{...options,signal:AbortSignal.any([options.signal,lifetime.signal])});
      const load=async url=>{
        const response=await remote(url,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{accept:'image/png,image/jpeg,image/webp'}});
        const mime=response.headers.get('content-type')?.split(';')[0];
        if(!['image/png','image/jpeg','image/webp','image/avif','image/gif'].includes(mime))throw Error('IMAGE_UNAVAILABLE');
        const bytes=await boundedBytes(response,8*1024*1024);
        const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:mime==='image/avif'?bytes.subarray(4,8).toString()==='ftyp'&&/avif|avis/.test(bytes.subarray(8,32).toString()):mime==='image/gif'?['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()):bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
        if(!valid)throw Error('INVALID_IMAGE');
        return {bytes,mime};
      };
      try {
        const metadataOriginal=async()=>{
          if(!readTokenURI)throw Error('NO_METADATA_READER');
          const controller=new AbortController();
          try{
            const timeout=new Promise((_,reject)=>{const signal=AbortSignal.timeout(6000);signal.addEventListener('abort',()=>reject(Error('URI_TIMEOUT')),{once:true});});
            const uri=await Promise.race([readTokenURI(id),timeout]);
            const combined=AbortSignal.any([controller.signal,AbortSignal.timeout(6500)]);
            const metadata=await Promise.any(nftIpfsUrls(uri).map(async url=>{
              const response=await remote(url,{redirect:'error',signal:combined,headers:{accept:'application/json'}});
              return JSON.parse((await boundedBytes(response,524288)).toString());
            }));
            controller.abort();
            return await Promise.any(nftIpfsUrls(metadata.image||metadata.image_url).map(load));
          }finally{controller.abort();}
        };
        const marketplaceOriginal=async()=>{
          if(readTokenURI)await new Promise(resolve=>setTimeout(resolve,1500));
          if(lifetime.signal.aborted)throw Error('CANCELLED');
          const response=await remote(`https://opensea.io/item/monad/${collection.toLowerCase()}/${id}`,{redirect:'error',signal:AbortSignal.timeout(12000),headers:{accept:'text/html'}});
          const html=(await boundedBytes(response,8*1024*1024)).toString();
          return load(originalNftImage(html,collection,id));
        };
        const {bytes,mime}=await Promise.any([metadataOriginal(),marketplaceOriginal()]);
        if(cached){size-=cached.bytes.length;cache.delete(id);}
        while(size+bytes.length>maxBytes&&cache.size){const key=cache.keys().next().value;size-=cache.get(key).bytes.length;cache.delete(key);}
        const result={bytes,mime,expires:Date.now()+ttlMs};
        if(bytes.length<=maxBytes){cache.set(id,result);size+=bytes.length;}
        return result;
      }catch{
        if(cached&&Date.now()-cached.expires<86400000)return cached;
        throw new AppError(502,'ARTWORK_UNAVAILABLE','This NFT image is temporarily unavailable. Please retry.');
      }
      finally{lifetime.abort();pending.delete(id);}
    });
    pending.set(id,request);return request;
  };
}
