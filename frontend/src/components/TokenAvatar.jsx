import React,{useEffect,useState} from 'react';

export default function TokenAvatar({nftId,collection,name='',className=''}) {
  const [failedSource,setFailedSource]=useState(null),[retry,setRetry]=useState(0);
  const source=/^0x[0-9a-f]{40}$/i.test(collection||'')&&/^\d+$/.test(String(nftId))
    ?`/api/studios/${nftId}/artwork?v=2&collection=${collection.toLowerCase()}`:null;
  useEffect(()=>{
    if(!source||failedSource!==source||retry>=2)return;
    const timer=setTimeout(()=>{setFailedSource(null);setRetry(n=>n+1);},3000);
    return()=>clearTimeout(timer);
  },[source,failedSource,retry]);
  return <span className={`token-avatar ${className}`}>
    {source&&failedSource!==source
      ?<img key={`${source}:${retry}`} src={source} alt={`${name} · Studio #${nftId}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailedSource(source)}/>
      :source?<span className="token-avatar-placeholder" title="Studio artwork is temporarily unavailable" aria-label={`Studio #${nftId} artwork unavailable`}/>
      :<span className="token-avatar-placeholder" aria-label="Loading studio artwork"/>}
  </span>;
}
