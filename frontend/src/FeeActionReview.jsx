import WalletAction from './WalletAction.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { units } from './market-format.mjs';

export default function FeeActionReview({token,wallet,signingWallet,cursor,quote=null,side=null,amount=null}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),pending=useRef(null);
  const approval=!!quote;
  useEffect(()=>{pending.current?.abort();setData(null);setError('');setBusy(false);return()=>pending.current?.abort();},[token.address,wallet,cursor,quote,side,amount]);
  async function inspect(){
    pending.current?.abort();const controller=new AbortController();pending.current=controller;setData(null);setError('');setBusy(true);
    try{
      const query=new URLSearchParams({wallet});
      if(approval){query.set('side',side);query.set('amountRaw',quote.quote.requestedInputRaw);}
      const requestPath=`/api/tokens/${token.address}/${approval?'approval':'claim-preflight'}?${query}`;
      const response=await fetch(requestPath,{signal:controller.signal,cache:'no-store'}),result=await response.json();
      if(!response.ok)throw new Error(result.error?.message||'Action inspection unavailable.');
      if(!controller.signal.aborted)setData({...result,requestPath});
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  const result=data?.[approval?'approval':'claim'];
  return <section className="action-review"><h3>{approval?'Approval plan':'Fee claim inspection'}</h3><p className="note">{approval?'Inspect an exact allowance for the verified spender. Nonzero replacements require a confirmed reset first.':'Inspect payment to the wallet with recorded credits, including former studio owners. Claims cover all launches in the same vault.'} Inspection is read-only. A connected wallet can confirm a separately reviewed transaction.</p><button className="primary" onClick={inspect} disabled={!wallet||busy}>{busy?'Inspecting contract…':approval?'Inspect approval plan':'Inspect fee claim'}</button>{error&&<div className="message error" role="alert">{error}</div>}{result&&<><dl><dt>{approval?'Approval status':'Claim status'}</dt><dd>{result.status}</dd>{approval?<><dt>Allowance now</dt><dd>{units(result.allowanceRaw)}</dd><dt>Required allowance</dt><dd>{units(result.requiredRaw)}</dd><dt>Asset / spender</dt><dd>{result.asset} / {result.spender}</dd></>:<><dt>Claim beneficiary</dt><dd>{result.beneficiary}</dd><dt>Claimable total</dt><dd>{units(result.credits.totalRaw)} CHOG</dd><dt>Creator / studio / platform credits</dt><dd>{units(result.credits.creatorRaw)} / {units(result.credits.studioRaw)} / {units(result.credits.platformRaw)} CHOG</dd><dt>Claim gas estimate</dt><dd>{result.gasEstimateRaw??'Unavailable: nothing to claim'}</dd></>}</dl><p className="note">{result.policy}</p>{(approval?result.steps:[result]).map((step,i)=><details key={i}><summary>{approval?`${i+1}. ${step.kind} · ${step.status}`:'Unsigned claim transaction'}</summary>{approval&&<p>Amount: {units(step.amountRaw)} · Gas estimate: {step.gasEstimateRaw??'Requires confirmed reset and fresh inspection'}</p>}<p>Chain: {step.transaction.chainId} · From: {step.transaction.from}</p><p>To: {step.transaction.to} · Value: 0</p><code style={{overflowWrap:'anywhere'}}>{step.transaction.data}</code></details>)}<p className="note">Block {data.snapshot.blockNumber} · {data.snapshot.blockTime} · {data.provenance?.finality??'unavailable'}</p><code style={{overflowWrap:'anywhere'}}>{data.snapshot.blockHash}</code><WalletAction wallet={signingWallet} body={data} kind={approval?'approval':'claim'} path={data.requestPath} label={approval?(result.steps[0]?.kind==='reset'?'Reset allowance in wallet':'Approve exact amount in wallet'):'Claim recorded fees in wallet'} onFinalized={()=>setData(null)} /></>}</section>;
}
