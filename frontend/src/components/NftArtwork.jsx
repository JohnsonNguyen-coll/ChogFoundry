import React,{useEffect,useState} from 'react';
import {api} from '../lib/api.mjs';
import {mediaUrls,readNftMetadata} from '../lib/nft-media.mjs';

export default function NftArtwork({id,tokenURI,collection,collectionName='NFT'}){
  const [state,setState]=useState(null),[attempt,setAttempt]=useState(0),[imageIndex,setImageIndex]=useState(0);
  const key=`${id}:${tokenURI??''}:${attempt}`;
  const preview=/^0x[0-9a-f]{40}$/i.test(collection||'')&&/^[0-9]+$/.test(id)?`https://opensea.io/item/monad/${collection.toLowerCase()}/${id}/opengraph-image`:null;
  useEffect(()=>{
    const c=new AbortController();setState(null);setImageIndex(0);
    (async()=>{
      const uri=tokenURI??(await api(`/studios/${id}`,c.signal)).nft.tokenURI;
      const metadata=await readNftMetadata(uri,c.signal),images=mediaUrls(metadata.image||metadata.image_url);
      if(!images.length)throw new Error('This NFT has no supported image in its metadata.');
      if(!c.signal.aborted){setImageIndex(0);setState({key,images,name:metadata.name||`${collectionName} #${id}`});}
    })().catch(error=>{if(!c.signal.aborted)setState({key,error:error.message});});
    return()=>c.abort();
  },[key,id,tokenURI,collectionName]);
  const current=state?.key===key?state:null,images=current?.images||[],isPreview=!images[imageIndex]&&!!preview&&imageIndex<=images.length,source=images[imageIndex]||(isPreview?preview:null);
  return <div className={`nft-artwork${isPreview?' nft-artwork-preview':''}`}>
    {source?<img src={source} alt={current?.name||`${collectionName} #${id}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setImageIndex(n=>n+1)}/>:
      <div className="nft-artwork-status"><span>{current?'NFT image unavailable':'Loading NFT artwork…'}</span>{current&&<button type="button" onClick={e=>{e.preventDefault();setAttempt(n=>n+1);}} title={current.error||'Image gateway unavailable'}>Retry image</button>}</div>}
  </div>;
}
