import useTrackedTransaction from './hooks/useTrackedTransaction.js';
import {Spinner} from './components/Loading.jsx';
import {statusLabel} from './lib/status-label.mjs';
import { useSelectedWallet } from './WalletProvider.jsx';
import { pendingFor } from './transaction-journal.mjs';
import React, { useEffect, useRef, useState } from 'react';
import { reviewedAction, submitReviewedTransaction } from './wallet-transaction.mjs';
async function get(path,signal){const response=await fetch(path,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])}),body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Fresh inspection unavailable.');return body;}
export default function WalletAction({wallet,body,kind,path,label,onFinalized}){
  const {provider}=useSelectedWallet();
  const tracking=useTrackedTransaction(onFinalized,{expected:kind==='approval'?body.approval?.steps?.[0]?.transaction:body[kind]?.transaction,snapshotBlock:body.snapshot?.blockNumber});
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[policy,setPolicy]=useState(null);
  const lifecycle=useRef(null);
  useEffect(()=>{const controller=new AbortController();lifecycle.current=controller;get('/api/execution',controller.signal).then(x=>{if(!controller.signal.aborted)setPolicy(x);}).catch(()=>{if(!controller.signal.aborted)setPolicy(null);});return()=>controller.abort();},[]);
  // An in-flight transaction stays attached to its original hash even when a quote refreshes.
  useEffect(()=>{if(!tracking.pending){setState(null);setError('');}},[body,wallet]);
  function show(next){if(!lifecycle.current.signal.aborted)setState(next);}
  async function sign(){
    if(tracking.pending||busy)return;setBusy(true);setError('');
    try{
      if(!wallet||!provider)throw new Error('Connect the wallet that will sign this transaction.');
      const signal=lifecycle.current.signal,permission=await get('/api/execution',signal);
      setPolicy(permission);
      if(!permission.walletExecutionAvailable||permission.chainId!==143)throw new Error('Mainnet deployment is not ready for wallet transactions.');
      const factory=body.deployment?.factory??body.launch?.factory;
      if(factory?.toLowerCase()!==permission.factory?.toLowerCase())throw new Error('Reviewed factory differs from the active deployment.');
      const reviewed=reviewedAction(body,kind),freshBody=await get(path,signal);
      if((freshBody.deployment?.factory??freshBody.launch?.factory)?.toLowerCase()!==permission.factory.toLowerCase())throw new Error('Deployment changed. Refresh the review.');
      const fresh=reviewedAction(freshBody,kind);
      if(freshBody.provenance?.finality!=='finalized'||freshBody.provenance.chainId!==143)throw new Error('We need confirmed Monad data before continuing. Refresh the review.');
      tracking.track(await submitReviewedTransaction(provider,reviewed,fresh,{wallet,signal,onState:show}));
    }catch(e){if(!lifecycle.current.signal.aborted)setError(e.message);}
    finally{if(!lifecycle.current.signal.aborted)setBusy(false);}
  }
  let simulated=false;try{reviewedAction(body,kind);simulated=true;}catch{}
  const pending=tracking.pending,display=tracking.transaction||state;
  const blockedReason=!wallet?'Connect your wallet to continue.':!simulated?(body[kind]?.blockers?.map(statusLabel).join(' ')||'This action is not ready. Refresh its review before continuing.'):!pending&&pendingFor(wallet)?'Waiting for your other transaction to be confirmed…':null;
  return <div className="wallet-action"><p className="note">Monad Mainnet · real assets. Your wallet confirms each transaction. {policy?.walletExecutionAvailable?'We check the transaction again before opening your wallet.':`Deployment unavailable: ${policy?.blockers?.map(statusLabel).join(' ')||'checking configuration'}.`}</p><button className="primary" onClick={sign} disabled={!wallet||!simulated||busy||pending||pendingFor(wallet)||!policy?.walletExecutionAvailable}>{busy?'Checking wallet…':label}</button>{blockedReason&&<p className="note" role="status">{blockedReason}</p>}{display&&<p role="status">Transaction: {statusLabel(display.status)}{display.hash&&<> · <a target="_blank" rel="noreferrer" href={`https://monadscan.com/tx/${display.hash}`}>{display.hash} ↗</a></>}</p>}{pending&&<div className="transaction-waiting"><Spinner label="Waiting for confirmation…"/><p className="note">This updates automatically. You can keep this review open.</p></div>}{display?.trackingError&&<p className="message error" role="alert">{display.trackingError}{!display.trackingPaused&&" Reconnecting automatically…"}</p>}{error&&<div className="message error" role="alert">{error}</div>}</div>;
}
