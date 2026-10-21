import React,{useEffect,useState} from 'react';
import {api} from '../lib/api.mjs';
import {mediaUrls,readNftMetadata} from '../lib/nft-media.mjs';
import {Spinner} from './Loading.jsx';

export default function NftArtwork({id,tokenURI,collection,collectionName='NFT'}){
  const [state,setState]=useState(null),[attempt,setAttempt]=useState(0),[imageIndex,setImageIndex]=useState(0);
  const [loadedSource,setLoadedSource]=useState(null);
  const key=`${collection}:${id}:${tokenURI??''}:${attempt}`;
  const preview=/^0x[0-9a-f]{40}$/i.test(collection||'')&&/^[0-9]+$/.test(id)?`/api/studios/${id}/artwork?v=2&collection=${collection.toLowerCase()}`:null;
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
  const current=state?.key===key?state:null,images=[...(preview?[preview]:[]),...(current?.images||[])],source=images[imageIndex],isPreview=source===preview&&!!preview;
  useEffect(()=>{
    if(!source||loadedSource===source)return;
    const timer=setTimeout(()=>setImageIndex(n=>n+1),isPreview?18000:8000);
    return()=>clearTimeout(timer);
  },[source,loadedSource,key,isPreview]);
  return <div className={`nft-artwork${isPreview?' nft-artwork-preview':''}`}>
    {source?<><img key={`${key}:${source}`} src={source} alt={current?.name||`${collectionName} #${id}`} loading="eager" referrerPolicy="no-referrer" onLoad={()=>setLoadedSource(source)} onError={()=>setImageIndex(n=>n+1)}/>{loadedSource!==source&&<div className="nft-loading"><Spinner label="Loading artwork…"/></div>}</>:
      <div className="nft-artwork-status">{current?<span>NFT image unavailable</span>:<Spinner label="Loading artwork…"/>}{current&&<button type="button" onClick={e=>{e.preventDefault();setAttempt(n=>n+1);}} title={current.error||'Image gateway unavailable'}>Retry image</button>}</div>}
  </div>;
}
