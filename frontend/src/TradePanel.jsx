import FeeActionReview from './FeeActionReview.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { parseAmount, units } from './market-format.mjs';

async function read(path, signal) {
  const response=await fetch('/api'+path,{signal,cache:'no-store'}),data=await response.json();
  if(!response.ok)throw new Error(data.error?.message||'Trade data is unavailable.');
  return data;
}
export default function TradePanel({ token, wallet, cursor }) {
  const [side,setSide]=useState('buy'),[amount,setAmount]=useState(''),[quote,setQuote]=useState(null),[account,setAccount]=useState(null),[error,setError]=useState(''),[accountError,setAccountError]=useState(''),[busy,setBusy]=useState(false);
  const [walletInput,setWalletInput]=useState(''),[inspectedWallet,setInspectedWallet]=useState(null),[accountRefresh,setAccountRefresh]=useState(0);
  const readWallet=wallet||inspectedWallet;
  const [slippage,setSlippage]=useState(''),[minutes,setMinutes]=useState(''),[preflight,setPreflight]=useState(null),[preflightError,setPreflightError]=useState(''),[preflightBusy,setPreflightBusy]=useState(false);
  const simulation=useRef(null);
  const pending=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();setAccount(null);setAccountError('');
    if(readWallet)read(`/tokens/${token.address}/account?wallet=${encodeURIComponent(readWallet)}`,controller.signal).then(data=>{if(!controller.signal.aborted)setAccount(data);}).catch(e=>{if(!controller.signal.aborted)setAccountError(e.message);});
    return ()=>controller.abort();
  },[token.address,readWallet,cursor,accountRefresh]);
  useEffect(()=>{pending.current?.abort();setQuote(null);setError('');setBusy(false);return ()=>pending.current?.abort();},[token.address,readWallet,cursor,side,amount]);
  useEffect(()=>{simulation.current?.abort();setPreflight(null);setPreflightError('');setPreflightBusy(false);return ()=>simulation.current?.abort();},[token.address,readWallet,cursor,side,amount,quote,slippage,minutes]);
  async function inspectSettlement(event) {
    event.preventDefault();simulation.current?.abort();const controller=new AbortController();simulation.current=controller;setPreflight(null);setPreflightError('');setPreflightBusy(true);
    try {
      if(!/^(0|[1-9][0-9]?)(?:\.[0-9]{1,2})?$/.test(slippage))throw new Error('Enter slippage from 0 to 99.99%, with at most two decimal places.');
      if(!/^[1-9][0-9]?$/.test(minutes)||Number(minutes)>60)throw new Error('Enter a deadline duration from 1 to 60 minutes.');
      const [whole,fraction='']=slippage.split('.');const bps=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
      const minimum=BigInt(quote.quote.outputRaw)*(10000n-bps)/10000n;
      if(minimum===0n)throw new Error('Minimum output rounds to zero. Choose a larger amount or lower slippage.');
      const query=new URLSearchParams({side,amountRaw:parseAmount(amount),wallet:readWallet,minOutputRaw:String(minimum),deadline:String(Math.floor(Date.now()/1000)+Number(minutes)*60)});
      const data=await read(`/tokens/${token.address}/preflight?${query}`,controller.signal);if(!controller.signal.aborted)setPreflight(data);
    }catch(e){if(!controller.signal.aborted)setPreflightError(e.message);}
    finally{if(!controller.signal.aborted)setPreflightBusy(false);}
  }
  async function preview(event) {
    event.preventDefault();pending.current?.abort();const controller=new AbortController();pending.current=controller;setQuote(null);setError('');setBusy(true);
    try {
      const raw=parseAmount(amount,18);
      const data=await read(`/tokens/${token.address}/quote?side=${side}&amountRaw=${raw}${readWallet?'&wallet='+encodeURIComponent(readWallet):''}`,controller.signal);
      if(!controller.signal.aborted)setQuote(data);
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="trade-panel"><h3>Review a trade quote</h3><p className="note">Curve getters or actual v4 swap simulation at a finalized block. No funds move and no wallet transaction is requested.</p>
    <form onSubmit={preview} className="trade-form"><label>Side<select value={side} onChange={e=>setSide(e.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>{side==='buy'?'Maximum CHOG budget':`${token.symbol} to sell`}<input aria-label="Trade amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="Enter an amount" required /></label><button className="primary" disabled={busy}>{busy?'Reading contract…':'Preview quote'}</button></form>
    {error&&<div className="message error" role="alert">{error}</div>}
    {quote&&<div className="quote-review"><dl><dt>Expected output</dt><dd>{units(quote.quote.outputRaw)} {side==='buy'?token.symbol:'CHOG'}</dd><dt>Actual input</dt><dd>{units(quote.quote.actualInputRaw)} {side==='buy'?'CHOG':token.symbol}</dd><dt>{side==='buy'?'Unused maximum budget':'Unspent input'}</dt><dd>{units(quote.quote.unusedBudgetRaw)} {side==='buy'?'CHOG':token.symbol} · {quote.quote.stage==='v4'?'returned after settlement':'not collected'}</dd><dt>Balance / approval basis</dt><dd>{units(quote.quote.requiredInputRaw)} {side==='buy'?'CHOG':token.symbol}</dd><dt>Spender</dt><dd>{quote.quote.spender}</dd><dt>Total protocol fee</dt><dd>{units(quote.quote.totalFeeRaw)} CHOG</dd><dt>Creator fee</dt><dd>{units(quote.quote.creatorFeeRaw)} CHOG</dd><dt>Studio fee</dt><dd>{units(quote.quote.studioFeeRaw)} CHOG</dd><dt>Platform fee</dt><dd>{units(quote.quote.platformFeeRaw)} CHOG</dd><dt>Balance / allowance</dt><dd>{!readWallet?'Connect or inspect a wallet to read balances and allowance.':`${quote.quote.balanceSufficient?'Sufficient balance':'Insufficient balance'} / ${quote.quote.allowanceSufficient?'Sufficient allowance':'Approval would be required'}`}</dd></dl><p className="note">{quote.fees.totalBps/100}% protocol fee · {quote.fees.rounding} {quote.quote.stage==='v4'?`LP fee: ${quote.fees.lpFeeUnits/10000}%, embedded in pool deltas. Protocol and LP rates use different bases; LP fee is not included in the CHOG fee amount above.`:'Curve LP fee: 0. Post-graduation totals are separate.'}</p><p className="note">Block {quote.provenance?.blockNumber??quote.snapshot.blockNumber} · {quote.provenance?.finality??'unavailable'}. Quote changes with trades; minimum output/deadline and a fresh preflight are still required before signing.</p><details className="note"><summary>Fee beneficiaries and quote source</summary><p>Original creator: {quote.beneficiaries.creator}</p><p>Studio owner at snapshot: {quote.beneficiaries.studioOwnerAtSnapshot}</p><p>Treasury: {quote.beneficiaries.treasury}</p><p>{quote.beneficiaries.policy}</p><code>{quote.snapshot.blockHash}</code><p>{quote.provenance?.rpcOrigin} · {quote.provenance?.fetchedAt}</p></details></div>}
    {quote&&<section><h3>Inspect settlement</h3><p className="note">Choose your own slippage and deadline. Simulation uses actual wallet balances and approvals; it cannot create an approval. No signature is requested.</p><form className="trade-form" onSubmit={inspectSettlement}><label>Slippage tolerance (%)<input aria-label="Slippage tolerance" inputMode="decimal" value={slippage} onChange={e=>setSlippage(e.target.value)} required /></label><label>Deadline (minutes)<input aria-label="Deadline minutes" inputMode="numeric" value={minutes} onChange={e=>setMinutes(e.target.value)} required /></label><button className="primary" disabled={!readWallet||preflightBusy}>{preflightBusy?'Simulating settlement…':'Inspect settlement'}</button></form>{preflightError&&<div className="message error" role="alert">{preflightError}</div>}{preflight&&<div className="quote-review"><dl><dt>Settlement status</dt><dd>{preflight.preflight.status}</dd><dt>Blockers</dt><dd>{preflight.preflight.blockers.length?preflight.preflight.blockers.join(', '):'None at the recorded block'}</dd><dt>Minimum output</dt><dd>{units(preflight.preflight.minOutputRaw)} {side==='buy'?token.symbol:'CHOG'}</dd><dt>Deadline</dt><dd>{new Date(Number(preflight.preflight.deadline)*1000).toISOString()}</dd><dt>Gas estimate</dt><dd>{preflight.preflight.gasEstimateRaw??'Unavailable: settlement has not been simulated'}</dd><dt>Chain / recipient</dt><dd>{preflight.preflight.transaction.chainId} / {preflight.preflight.recipient}</dd></dl><p className="note">{preflight.preflight.policy}</p><details><summary>Unsigned transaction and source</summary><p>To: {preflight.preflight.transaction.to}</p><p>Value: 0</p><code style={{overflowWrap:'anywhere'}}>{preflight.preflight.transaction.data}</code><p>Block {preflight.snapshot.blockNumber} · {preflight.snapshot.blockHash}</p></details></div>}</section>}
    {quote&&readWallet&&<FeeActionReview token={token} wallet={readWallet} cursor={cursor} quote={quote} side={side} amount={amount} />}
    <h3>Wallet holdings & fee credits</h3>{!wallet&&<form className="trade-form" onSubmit={event=>{event.preventDefault();const value=walletInput.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(value)){setAccountError('Enter a complete EVM wallet address.');return;}setInspectedWallet(value);setAccountRefresh(n=>n+1);}}><label>Wallet address to inspect<input aria-label="Wallet address to inspect" value={walletInput} onChange={e=>setWalletInput(e.target.value)} placeholder="0x…" required spellCheck="false" /></label><button className="primary">Inspect wallet</button></form>}<p className="note">{readWallet?`Inspecting ${readWallet}. Read-only wallet lookup grants no signing or studio permissions.`:'Connect a wallet or inspect a public wallet address.'}</p>{accountError&&<div className="message error" role="alert">{accountError}</div>}{!readWallet?<p className="note">Choose a wallet to read balances, curve allowances and recorded fee credits.</p>:accountError?null:!account?<p className="note">Reading wallet state…</p>:<><dl><dt>{token.symbol} balance</dt><dd>{units(account.account.tokenBalanceRaw)}</dd><dt>CHOG balance</dt><dd>{units(account.account.quoteBalanceRaw)}</dd><dt>CHOG curve allowance</dt><dd>{units(account.account.quoteAllowanceRaw)}</dd><dt>Token curve allowance</dt><dd>{units(account.account.tokenAllowanceRaw)}</dd><dt>Creator fee credits</dt><dd>{units(account.account.feeCredits.creatorRaw)} CHOG</dd><dt>Studio fee credits</dt><dd>{units(account.account.feeCredits.studioRaw)} CHOG</dd><dt>Platform fee credits</dt><dd>{units(account.account.feeCredits.platformRaw)} CHOG</dd></dl><p className="note">{account.account.feeCredits.scope} These credits belong to the recorded wallet even after an NFT transfer. Claim signing is not available yet.</p><p className="note">Wallet read at block {account.provenance.blockNumber} · {account.provenance.blockTime} · {account.provenance.rpcOrigin}</p></>}
    {readWallet&&<FeeActionReview token={token} wallet={readWallet} cursor={cursor} />}
  </div>;
}
