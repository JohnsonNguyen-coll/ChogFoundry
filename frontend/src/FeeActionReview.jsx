import {statusLabel} from './lib/status-label.mjs';
import WalletAction from './WalletAction.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { units } from './market-format.mjs';

export default function FeeActionReview({token,wallet,signingWallet,quote=null,side=null,amount=null,onFinalized}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),pending=useRef(null);
  const approval=!!quote;
  // Live block updates must not erase a claim while it is being inspected or
  // signed. WalletAction freshly verifies the action before opening the wallet.
  useEffect(()=>{pending.current?.abort();setData(null);setError('');setBusy(false);return()=>pending.current?.abort();},[token.address,wallet,signingWallet,quote,side,amount]);
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
  return <section className="action-review"><h3>{approval?'Spending approval':'Claim your fees'}</h3><p className="note">{approval?'Approve only the amount needed for this trade. If an old spending limit must be cleared, confirm that reset first.':'Claim fees earned by this wallet, including fees earned before selling a studio NFT. This includes its fees from all launches that share the same fee account.'} Checking does not move funds. You confirm the payment in your wallet.</p><button className="primary" onClick={inspect} disabled={!wallet||busy}>{busy?'Inspecting contract…':approval?'Review spending approval':'Review fees to claim'}</button>{error&&<div className="message error" role="alert">{error}</div>}{result&&<><dl><dt>{approval?'Approval status':'Claim status'}</dt><dd>{statusLabel(result.status)}</dd>{approval?<><dt>Current spending limit</dt><dd>{units(result.allowanceRaw)}</dd><dt>Spending limit needed</dt><dd>{units(result.requiredRaw)}</dd><dt>Token / approved contract</dt><dd>{result.asset} / {result.spender}</dd></>:<><dt>Receiving wallet</dt><dd>{result.beneficiary}</dd><dt>Available to claim</dt><dd>{units(result.credits.totalRaw)} CHOG</dd><dt>Creator / studio / platform fees</dt><dd>{units(result.credits.creatorRaw)} / {units(result.credits.studioRaw)} / {units(result.credits.platformRaw)} CHOG</dd><dt>Estimated network resources</dt><dd>{result.gasEstimateRaw??'Unavailable: nothing to claim'}</dd></>}</dl><details className="note"><summary>More about this payment</summary><p>{result.policy}</p></details>{(approval?result.steps:[result]).map((step,i)=><details key={i}><summary>{approval?`${i+1}. ${step.kind} · ${step.status}`:'Transaction details'}</summary>{approval&&<p>Amount: {units(step.amountRaw)} · Gas estimate: {step.gasEstimateRaw??'Confirm the reset, then check again'}</p>}<p>Chain: {step.transaction.chainId} · From: {step.transaction.from}</p><p>To: {step.transaction.to} · Value: 0</p><code style={{overflowWrap:'anywhere'}}>{step.transaction.data}</code></details>)}<p className="note">Block {data.snapshot.blockNumber} · {data.snapshot.blockTime} · {data.provenance?.finality??'unavailable'}</p><code style={{overflowWrap:'anywhere'}}>{data.snapshot.blockHash}</code><WalletAction wallet={signingWallet} body={data} kind={approval?'approval':'claim'} path={data.requestPath} label={approval?(result.steps[0]?.kind==='reset'?'Reset spending approval in wallet':'Approve exact amount in wallet'):'Claim recorded fees in wallet'} onFinalized={result=>{if(approval&&data.approval.steps[0]?.kind==='reset')void inspect();else{setData(null);onFinalized?.(result);}}} /></>}</section>;
}
