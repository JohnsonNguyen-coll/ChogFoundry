import {AppError,tokenId} from './validation.mjs';

// Fixed public source for the configured collection; never an arbitrary URL proxy.
export function nftArtworkReader(collection,{fetchImage=fetch,ttlMs=300000,maxBytes=32*1024*1024}={}) {
  const cache=new Map(),pending=new Map();let size=0;
  return async input=>{
    const id=String(tokenId(input)),cached=cache.get(id);
    if(cached&&cached.expires>Date.now())return cached;
    if(pending.has(id))return pending.get(id);
    if(pending.size>=8)throw new AppError(503,'ARTWORK_BUSY','Images are loading. Please try again shortly.');
    const request=Promise.resolve().then(async()=>{
      try {
        const response=await fetchImage(`https://opensea.io/item/monad/${collection.toLowerCase()}/${id}/opengraph-image`,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'image/png,image/jpeg,image/webp'}});
        const mime=response.headers.get('content-type')?.split(';')[0];
        if(!response.ok||!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('IMAGE_UNAVAILABLE');
        const chunks=[];let length=0;
        for await(const chunk of response.body){length+=chunk.length;if(length>8*1024*1024)throw Error('IMAGE_TOO_LARGE');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks);
        const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
        if(!valid)throw Error('INVALID_IMAGE');
        if(cached){size-=cached.bytes.length;cache.delete(id);}
        while(size+bytes.length>maxBytes&&cache.size){const key=cache.keys().next().value;size-=cache.get(key).bytes.length;cache.delete(key);}
        const result={bytes,mime,expires:Date.now()+ttlMs};
        if(bytes.length<=maxBytes){cache.set(id,result);size+=bytes.length;}
        return result;
      }catch{
        if(cached&&Date.now()-cached.expires<86400000)return cached;
        throw new AppError(502,'ARTWORK_UNAVAILABLE','This NFT image is temporarily unavailable. Please retry.');
      }
      finally{pending.delete(id);}
    });
    pending.set(id,request);return request;
  };
}
