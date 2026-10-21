import {statusLabel} from './lib/status-label.mjs';
import { useSelectedWallet } from './WalletProvider.jsx';
import { pendingFor, subscribe, updateTransaction } from './transaction-journal.mjs';
import React, { useEffect, useRef, useState } from 'react';
import { reviewedAction, submitReviewedTransaction, inspectTransaction } from './wallet-transaction.mjs';
async function get(path,signal){const response=await fetch(path,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])}),body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Fresh inspection unavailable.');return body;}
export default function WalletAction({wallet,body,kind,path,label,onFinalized}){
  const {provider}=useSelectedWallet();
  const [,refresh]=useState(0);useEffect(()=>subscribe(()=>refresh(n=>n+1)),[]);
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[policy,setPolicy]=useState(null);
  const lifecycle=useRef(null),submitted=useRef(null),callback=useRef(onFinalized);callback.current=onFinalized;
  useEffect(()=>{const controller=new AbortController();lifecycle.current=controller;get('/api/execution',controller.signal).then(x=>{if(!controller.signal.aborted)setPolicy(x);}).catch(()=>{if(!controller.signal.aborted)setPolicy(null);});return()=>controller.abort();},[]);
  // An in-flight transaction stays attached to its original hash even when a quote refreshes.
  useEffect(()=>{if(!submitted.current){setState(null);setError('');}},[body,wallet]);
  function show(next){if(!lifecycle.current.signal.aborted)setState(next);}
  async function track(){
    if(!submitted.current||busy)return;setBusy(true);setError('');
    try{const result=await inspectTransaction(provider,submitted.current.hash,submitted.current.transaction);updateTransaction(submitted.current.hash,result);show(result);if(['finalized','reverted'].includes(result.status)){submitted.current=null;if(result.status==='finalized')callback.current?.(result);}}
    catch(e){if(!lifecycle.current.signal.aborted)setError(e.message);}
    finally{if(!lifecycle.current.signal.aborted)setBusy(false);}
  }
  async function sign(){
    if(submitted.current||busy)return;setBusy(true);setError('');
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
      submitted.current=await submitReviewedTransaction(provider,reviewed,fresh,{wallet,signal,onState:show});
    }catch(e){if(!lifecycle.current.signal.aborted)setError(e.message);}
    finally{if(!lifecycle.current.signal.aborted)setBusy(false);}
  }
  let simulated=false;try{reviewedAction(body,kind);simulated=true;}catch{}
  const pending=!!submitted.current;
  const blockedReason=!wallet?'Connect your wallet to continue.':!simulated?(body[kind]?.blockers?.map(statusLabel).join(' ')||'This action is not ready. Refresh its review before continuing.'):!pending&&pendingFor(wallet)?'Check your other pending transaction before continuing.':null;
  return <div className="wallet-action"><p className="note">Monad Mainnet · real assets. Your wallet confirms each transaction. {policy?.walletExecutionAvailable?'We check the transaction again before opening your wallet.':`Deployment unavailable: ${policy?.blockers?.map(statusLabel).join(' ')||'checking configuration'}.`}</p><button className="primary" onClick={sign} disabled={!wallet||!simulated||busy||pending||pendingFor(wallet)||!policy?.walletExecutionAvailable}>{busy?'Checking wallet…':label}</button>{blockedReason&&<p className="note" role="status">{blockedReason}</p>}{state&&<p role="status">Transaction: {statusLabel(state.status)}{state.hash&&<> · <a target="_blank" rel="noreferrer" href={`https://monadscan.com/tx/${state.hash}`}>{state.hash} ↗</a></>}</p>}{pending&&<><button onClick={track} disabled={busy}>Check confirmation</button><p className="note">Do not resend while pending. If replaced or cancelled in your wallet, inspect the replacement there. This page never retries automatically.</p></>}{error&&<div className="message error" role="alert">{error}</div>}</div>;
}
