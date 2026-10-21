import {statusLabel} from './lib/status-label.mjs';
import WalletAction from './WalletAction.jsx';
import Modal from './components/Modal.jsx';
import {Spinner} from './components/Loading.jsx';
import FeeActionReview from './FeeActionReview.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { parseAmount, units } from './market-format.mjs';

async function read(path, signal) {
  const response=await fetch('/api'+path,{signal:AbortSignal.any([signal,AbortSignal.timeout(25000)]),cache:'no-store'}),data=await response.json();
  if(!response.ok)throw new Error(data.error?.message||'Trade data is unavailable.');
  return data;
}
export default function TradePanel({ token, wallet, cursor }) {
  const [reviewOpen,setReviewOpen]=useState(false),[completedHash,setCompletedHash]=useState(null);
  const [side,setSide]=useState('buy'),[amount,setAmount]=useState(''),[quote,setQuote]=useState(null),[account,setAccount]=useState(null),[error,setError]=useState(''),[accountError,setAccountError]=useState(''),[busy,setBusy]=useState(false);
  const [accountRefresh,setAccountRefresh]=useState(0);
  const readWallet=wallet;
  const [slippage,setSlippage]=useState(''),[preflight,setPreflight]=useState(null),[preflightError,setPreflightError]=useState(''),[preflightBusy,setPreflightBusy]=useState(false);
  const simulation=useRef(null);
  const pending=useRef(null);
  const resumeReview=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();let timer, failures=0;
    setAccount(null);setAccountError('');
    const poll=async()=>{
      try {
        const data=await read(`/tokens/${token.address}/account?wallet=${encodeURIComponent(readWallet)}`,controller.signal);
        if(!controller.signal.aborted){failures=0;setAccount(data);setAccountError('');}
      }catch(e){if(!controller.signal.aborted){failures++;setAccount(null);setAccountError(e.message);}}
      finally{if(!controller.signal.aborted)timer=setTimeout(poll,failures?Math.min(15000,3000*failures):15000);}
    };
    if(readWallet)void poll();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[token.address,readWallet,accountRefresh]);
  useEffect(()=>{pending.current?.abort();setQuote(null);setError('');setBusy(false);return ()=>pending.current?.abort();},[token.address,readWallet,side,amount]);
  useEffect(()=>{simulation.current?.abort();setPreflight(null);setPreflightError('');setPreflightBusy(false);return ()=>simulation.current?.abort();},[token.address,readWallet,side,amount,quote,slippage]);
  useEffect(()=>{
    if(quote&&resumeReview.current){resumeReview.current=false;void inspectSettlement(null,quote);}
  },[quote]);
  async function inspectSettlement(event,activeQuote=quote) {
    event?.preventDefault();simulation.current?.abort();const controller=new AbortController();simulation.current=controller;setPreflight(null);setPreflightError('');setPreflightBusy(true);
    try {
      if(!/^(0|[1-9][0-9]?)(?:\.[0-9]{1,2})?$/.test(slippage))throw new Error('Enter an allowed price change from 0 to 99.99%, using up to two decimal places.');
      const [whole,fraction='']=slippage.split('.');const bps=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
      const minimum=BigInt(activeQuote.quote.outputRaw)*(10000n-bps)/10000n;
      if(minimum===0n)throw new Error('This trade would allow you to receive nothing. Increase the amount or reduce the allowed price change.');
      const query=new URLSearchParams({side,amountRaw:parseAmount(amount),wallet:readWallet,minOutputRaw:String(minimum),deadline:String(Math.floor(Date.now()/1000)+20*60)});
      const requestPath=`/api/tokens/${token.address}/preflight?${query}`;const data=await read(requestPath.slice(4),controller.signal);if(!controller.signal.aborted)setPreflight({...data,requestPath});
    }catch(e){if(!controller.signal.aborted)setPreflightError(e.message);}
    finally{if(!controller.signal.aborted)setPreflightBusy(false);}
  }
  async function preview(event) {
    event?.preventDefault();pending.current?.abort();const controller=new AbortController();pending.current=controller;setQuote(null);setError('');setBusy(true);
    try {
      const raw=parseAmount(amount,18);
      const data=await read(`/tokens/${token.address}/quote?side=${side}&amountRaw=${raw}${readWallet?'&wallet='+encodeURIComponent(readWallet):''}`,controller.signal);
      if(!controller.signal.aborted){setQuote(data);setReviewOpen(true);return data;}
    }catch(e){if(!controller.signal.aborted)setError(e.message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  async function approvalConfirmed(){
    setAccountRefresh(n=>n+1);
    resumeReview.current=!!slippage;
    await preview();
  }
  return <aside className="trade-panel terminal-order">
    <div className="order-heading"><span className="eyebrow">PLACE A TRADE</span><span className="order-network">Monad</span></div>
    <div className="order-sides" role="group" aria-label="Trade side">{['buy','sell'].map(value=><button type="button" key={value} className={side===value?`selected ${value}`:''} aria-pressed={side===value} onClick={()=>setSide(value)}>{value==='buy'?'Buy':'Sell'}</button>)}</div>
    <form onSubmit={preview} className="order-form">
      <div className="order-amount-heading"><label htmlFor="trade-amount">{side==='buy'?'You pay':'You sell'}</label><span>{side==='buy'?'CHOG':token.symbol}</span></div>
      <input id="trade-amount" aria-label="Trade amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" required autoComplete="off"/>
      <div className="order-balance"><span>Available</span><span>{account?`${units(side==='buy'?account.account.quoteBalanceRaw:account.account.tokenBalanceRaw)} ${side==='buy'?'CHOG':token.symbol}`:readWallet?(accountError?'Unavailable':'Loading…'):'Connect your wallet'}</span></div>
      <button className={`primary order-submit ${side}`} disabled={busy}>{busy?<Spinner label="Getting price…"/>:`Preview ${side}`}</button>
    </form>
    {completedHash&&<div className="message" role="status">Trade confirmed. <a href={`https://monadscan.com/tx/${completedHash}`} target="_blank" rel="noreferrer">View transaction ↗</a></div>}
    {error&&<div className="message error" role="alert">{error}</div>}
    {accountError&&<div className="message" role="status">Balance unavailable. You can retry with a fresh preview.</div>}
    <p className="order-help">Review the price and fees before you confirm in your wallet.</p>
    <div className="order-wallet"><span>Your {token.symbol}</span><strong>{account?units(account.account.tokenBalanceRaw):'—'}</strong><span>Your CHOG</span><strong>{account?units(account.account.quoteBalanceRaw):'—'}</strong></div>
    {!wallet&&<p className="note">Connect your wallet using the button in the navigation bar to trade.</p>}
    <Modal open={reviewOpen} onClose={()=>setReviewOpen(false)} title={`Review ${side==='buy'?'buy':'sell'}`} className="trade-review-modal">
    {quote&&<div className="quote-review"><dl><dt>Expected output</dt><dd>{units(quote.quote.outputRaw)} {side==='buy'?token.symbol:'CHOG'}</dd><dt>Actual input</dt><dd>{units(quote.quote.actualInputRaw)} {side==='buy'?'CHOG':token.symbol}</dd><dt>{side==='buy'?'Unused maximum budget':'Unspent input'}</dt><dd>{units(quote.quote.unusedBudgetRaw)} {side==='buy'?'CHOG':token.symbol} · {quote.quote.stage==='v4'?'returned after settlement':'not collected'}</dd><dt>Amount needed</dt><dd>{units(quote.quote.requiredInputRaw)} {side==='buy'?'CHOG':token.symbol}</dd><dt>Contract allowed to spend</dt><dd>{quote.quote.spender}</dd><dt>Total protocol fee</dt><dd>{units(quote.quote.totalFeeRaw)} CHOG</dd><dt>Creator fee</dt><dd>{units(quote.quote.creatorFeeRaw)} CHOG</dd><dt>Studio fee</dt><dd>{units(quote.quote.studioFeeRaw)} CHOG</dd><dt>Platform fee</dt><dd>{units(quote.quote.platformFeeRaw)} CHOG</dd><dt>Balance / spending approval</dt><dd>{!readWallet?'Connect your wallet to check your balance and spending approval.':`${quote.quote.balanceSufficient?'Sufficient balance':'Insufficient balance'} / ${quote.quote.allowanceSufficient?'Spending approved':'Spending approval needed'}`}</dd></dl><p className="note">{quote.fees.totalBps/100}% protocol fee · {quote.quote.stage==='v4'?`LP fee: ${quote.fees.lpFeeUnits/10000}%, charged by the liquidity pool and calculated separately. It is not included in the CHOG fees shown above.`:'No liquidity pool fee before the token moves to a pool.'}</p><p className="note">Block {quote.provenance?.blockNumber??quote.snapshot.blockNumber} · {quote.provenance?.finality??'unavailable'}. Prices can change. We check the trade again before asking you to confirm.</p><details className="note"><summary>Who receives the fees & price details</summary><p>Original creator: {quote.beneficiaries.creator}</p><p>Studio owner when checked: {quote.beneficiaries.studioOwnerAtSnapshot}</p><p>Treasury: {quote.beneficiaries.treasury}</p><p>{quote.beneficiaries.policy}</p><p>{quote.fees.rounding}</p><code>{quote.snapshot.blockHash}</code><p>{quote.provenance?.rpcOrigin} · {quote.provenance?.fetchedAt}</p></details></div>}
    {quote&&<section><h3>Review trade</h3><p className="note">Set the largest price change you accept before the trade completes. We check your balance and spending permission before you confirm in your wallet.</p><form className="trade-form" onSubmit={inspectSettlement}><label>Maximum price change (%)<input aria-label="Slippage tolerance" inputMode="decimal" value={slippage} onChange={e=>setSlippage(e.target.value)} required /></label><button className="primary" disabled={!readWallet||preflightBusy}>{preflightBusy?'Checking trade…':'Review trade'}</button></form>{preflightError&&<div className="message error" role="alert">{preflightError}</div>}{preflight&&<div className="quote-review"><dl><dt>Trade status</dt><dd>{statusLabel(preflight.preflight.status)}</dd><dt>What needs attention</dt><dd>{preflight.preflight.blockers.length?preflight.preflight.blockers.map(statusLabel).join(' '):'No issues found'}</dd><dt>Minimum you receive</dt><dd>{units(preflight.preflight.minOutputRaw)} {side==='buy'?token.symbol:'CHOG'}</dd><dt>Network fee</dt><dd>Your wallet will show the fee before you confirm.</dd><dt>Network ID / receiving wallet</dt><dd>{preflight.preflight.transaction.chainId} / {preflight.preflight.recipient}</dd></dl><details><summary>Transaction details</summary><p>Estimated gas units: {preflight.preflight.gasEstimateRaw??"Not available"}</p><p className="note">{preflight.preflight.policy}</p><p>To: {preflight.preflight.transaction.to}</p><p>Value: 0</p><code style={{overflowWrap:'anywhere'}}>{preflight.preflight.transaction.data}</code><p>Block {preflight.snapshot.blockNumber} · {preflight.snapshot.blockHash}</p></details><WalletAction wallet={wallet} body={preflight} kind="preflight" path={preflight.requestPath} label={side==='buy'?'Buy in wallet':'Sell in wallet'} onFinalized={result=>{setCompletedHash(result.hash);setReviewOpen(false);setPreflight(null);setQuote(null);setAccountRefresh(n=>n+1);}} /></div>}</section>}
    {quote&&readWallet&&<FeeActionReview token={token} wallet={readWallet} signingWallet={wallet} cursor={quote.snapshot.blockHash} quote={quote} side={side} amount={amount} onFinalized={approvalConfirmed} />}
    </Modal>
  </aside>;
}
