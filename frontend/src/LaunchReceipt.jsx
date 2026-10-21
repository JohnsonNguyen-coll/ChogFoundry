import React, { useEffect, useRef, useState } from 'react';
import { units } from './market-format.mjs';
export default function LaunchReceipt({nftId,wallet}){
  const [hash,setHash]=useState(''),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),pending=useRef(null);
  useEffect(()=>{pending.current?.abort();setData(null);setError('');setBusy(false);return()=>pending.current?.abort();},[nftId,wallet,hash]);
  async function inspect(e){
    e.preventDefault();pending.current?.abort();const controller=new AbortController();pending.current=controller;setData(null);setError('');setBusy(true);
    try{
      const query=new URLSearchParams({transactionHash:hash.trim()});
      const response=await fetch(`/api/studios/${encodeURIComponent(nftId)}/launch-receipt?${query}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),cache:'no-store'}),body=await response.json();
      if(!response.ok)throw new Error(body.error?.message||'Launch receipt unavailable.');
      if(!controller.signal.aborted)setData(body);
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  const receipt=data?.receipt,buy=receipt?.firstBuy;
  return <section className="launch-receipt"><h3>Verify a completed launch</h3><p className="note">Paste the transaction ID from your wallet to check a completed launch for this studio. Anyone can view the result.</p><form className="lookup" onSubmit={inspect}><label htmlFor="launch-receipt-hash">Launch transaction ID</label><div><input id="launch-receipt-hash" value={hash} onChange={e=>setHash(e.target.value)} placeholder="0x…" required spellCheck="false"/><button className="primary" disabled={!nftId||busy}>{busy?'Verifying receipt…':'Verify launch receipt'}</button></div></form>{error&&<div className="message error" role="alert">{error}</div>}{receipt&&<div className="receipt-review"><dl><dt>Launch status</dt><dd>{receipt.status}</dd><dt>Created token</dt><dd>{data.token.name} / {data.token.symbol} · {receipt.tokenAddress}</dd><dt>Original creator</dt><dd>{receipt.creator}</dd><dt>Fixed supply</dt><dd>{units(receipt.supplyRaw)}</dd><dt>First-buy maximum budget</dt><dd>{units(buy.requestedBudgetRaw)} CHOG</dd><dt>Actual first-buy spend</dt><dd>{units(buy.actualSpentRaw)} CHOG</dd><dt>CHOG refunded</dt><dd>{units(buy.refundRaw)} CHOG</dd><dt>Actual first-buy tokens received</dt><dd>{units(buy.actualTokenOutRaw)} {data.token.symbol}</dd><dt>Network resources used</dt><dd>{receipt.gasUsedRaw}</dd><dt>Network fee</dt><dd>{receipt.nativeFeeRaw==null?'Unavailable':`${units(receipt.nativeFeeRaw)} MON`}</dd>{buy.fees&&<><dt>Creator / studio / platform fees</dt><dd>{units(buy.fees.creatorRaw)} / {units(buy.fees.studioRaw)} / {units(buy.fees.platformRaw)} CHOG</dd><dt>Studio owner when fees were earned</dt><dd>{buy.fees.studioOwnerAtAccrual}</dd></>}</dl><p className="note">{receipt.policy}</p><details><summary>Transaction confirmation details</summary><p>{receipt.transactionHash} · factory event log #{receipt.factoryEventLogIndex}</p><p>Receipt block {data.snapshot.blockNumber} · {data.snapshot.blockTime} · verified through {data.verifiedThroughBlock} · {data.provenance?.finality??'unavailable'}</p><code style={{overflowWrap:'anywhere'}}>{data.snapshot.blockHash}</code><p>{data.provenance?.rpcOrigin} · {data.provenance?.fetchedAt}</p></details></div>}</section>;
}
