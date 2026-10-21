import {statusLabel} from './lib/status-label.mjs';
import WalletAction from './WalletAction.jsx';
import WalletActivity from './WalletActivity.jsx';
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
  const [slippage,setSlippage]=useState(''),[preflight,setPreflight]=useState(null),[preflightError,setPreflightError]=useState(''),[preflightBusy,setPreflightBusy]=useState(false);
  const simulation=useRef(null);
  const pending=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();setAccount(null);setAccountError('');
    if(readWallet)read(`/tokens/${token.address}/account?wallet=${encodeURIComponent(readWallet)}`,controller.signal).then(data=>{if(!controller.signal.aborted)setAccount(data);}).catch(e=>{if(!controller.signal.aborted)setAccountError(e.message);});
    return ()=>controller.abort();
  },[token.address,readWallet,cursor,accountRefresh]);
  useEffect(()=>{pending.current?.abort();setQuote(null);setError('');setBusy(false);return ()=>pending.current?.abort();},[token.address,readWallet,cursor,side,amount]);
  useEffect(()=>{simulation.current?.abort();setPreflight(null);setPreflightError('');setPreflightBusy(false);return ()=>simulation.current?.abort();},[token.address,readWallet,cursor,side,amount,quote,slippage]);
  async function inspectSettlement(event) {
    event.preventDefault();simulation.current?.abort();const controller=new AbortController();simulation.current=controller;setPreflight(null);setPreflightError('');setPreflightBusy(true);
    try {
      if(!/^(0|[1-9][0-9]?)(?:\.[0-9]{1,2})?$/.test(slippage))throw new Error('Enter an allowed price change from 0 to 99.99%, using up to two decimal places.');
      const [whole,fraction='']=slippage.split('.');const bps=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
      const minimum=BigInt(quote.quote.outputRaw)*(10000n-bps)/10000n;
      if(minimum===0n)throw new Error('This trade would allow you to receive nothing. Increase the amount or reduce the allowed price change.');
      const query=new URLSearchParams({side,amountRaw:parseAmount(amount),wallet:readWallet,minOutputRaw:String(minimum),deadline:String(Math.floor(Date.now()/1000)+20*60)});
      const requestPath=`/api/tokens/${token.address}/preflight?${query}`;const data=await read(requestPath.slice(4),controller.signal);if(!controller.signal.aborted)setPreflight({...data,requestPath});
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
  return <div className="trade-panel"><h3>Review a trade quote</h3><p className="note">Curve getters or actual v4 swap simulation at a finalized block. Quotes are read-only. Review a separate wallet transaction to trade.</p>
    <form onSubmit={preview} className="trade-form"><label>Side<select value={side} onChange={e=>setSide(e.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>{side==='buy'?'Maximum CHOG budget':`${token.symbol} to sell`}<input aria-label="Trade amount" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="Enter an amount" required /></label><button className="primary" disabled={busy}>{busy?'Reading contract…':'Preview quote'}</button></form>
    {error&&<div className="message error" role="alert">{error}</div>}
    {quote&&<div className="quote-review"><dl><dt>Expected output</dt><dd>{units(quote.quote.outputRaw)} {side==='buy'?token.symbol:'CHOG'}</dd><dt>Actual input</dt><dd>{units(quote.quote.actualInputRaw)} {side==='buy'?'CHOG':token.symbol}</dd><dt>{side==='buy'?'Unused maximum budget':'Unspent input'}</dt><dd>{units(quote.quote.unusedBudgetRaw)} {side==='buy'?'CHOG':token.symbol} · {quote.quote.stage==='v4'?'returned after settlement':'not collected'}</dd><dt>Amount needed</dt><dd>{units(quote.quote.requiredInputRaw)} {side==='buy'?'CHOG':token.symbol}</dd><dt>Contract allowed to spend</dt><dd>{quote.quote.spender}</dd><dt>Total protocol fee</dt><dd>{units(quote.quote.totalFeeRaw)} CHOG</dd><dt>Creator fee</dt><dd>{units(quote.quote.creatorFeeRaw)} CHOG</dd><dt>Studio fee</dt><dd>{units(quote.quote.studioFeeRaw)} CHOG</dd><dt>Platform fee</dt><dd>{units(quote.quote.platformFeeRaw)} CHOG</dd><dt>Balance / spending approval</dt><dd>{!readWallet?'Connect your wallet or enter an address to check its balance and spending approval.':`${quote.quote.balanceSufficient?'Sufficient balance':'Insufficient balance'} / ${quote.quote.allowanceSufficient?'Spending approved':'Spending approval needed'}`}</dd></dl><p className="note">{quote.fees.totalBps/100}% protocol fee · {quote.quote.stage==='v4'?`LP fee: ${quote.fees.lpFeeUnits/10000}%, charged by the liquidity pool and calculated separately. It is not included in the CHOG fees shown above.`:'No liquidity pool fee before the token moves to a pool.'}</p><p className="note">Block {quote.provenance?.blockNumber??quote.snapshot.blockNumber} · {quote.provenance?.finality??'unavailable'}. Prices can change. We check the trade again before asking you to confirm.</p><details className="note"><summary>Who receives the fees & price details</summary><p>Original creator: {quote.beneficiaries.creator}</p><p>Studio owner when checked: {quote.beneficiaries.studioOwnerAtSnapshot}</p><p>Treasury: {quote.beneficiaries.treasury}</p><p>{quote.beneficiaries.policy}</p><p>{quote.fees.rounding}</p><code>{quote.snapshot.blockHash}</code><p>{quote.provenance?.rpcOrigin} · {quote.provenance?.fetchedAt}</p></details></div>}
    {quote&&<section><h3>Review trade</h3><p className="note">Set the largest price change you accept before the trade completes. We check your balance and spending permission before you confirm in your wallet.</p><form className="trade-form" onSubmit={inspectSettlement}><label>Maximum price change (%)<input aria-label="Slippage tolerance" inputMode="decimal" value={slippage} onChange={e=>setSlippage(e.target.value)} required /></label><button className="primary" disabled={!readWallet||preflightBusy}>{preflightBusy?'Checking trade…':'Review trade'}</button></form>{preflightError&&<div className="message error" role="alert">{preflightError}</div>}{preflight&&<div className="quote-review"><dl><dt>Trade status</dt><dd>{statusLabel(preflight.preflight.status)}</dd><dt>What needs attention</dt><dd>{preflight.preflight.blockers.length?preflight.preflight.blockers.map(statusLabel).join(' '):'No issues found'}</dd><dt>Minimum you receive</dt><dd>{units(preflight.preflight.minOutputRaw)} {side==='buy'?token.symbol:'CHOG'}</dd><dt>Network fee</dt><dd>Your wallet will show the fee before you confirm.</dd><dt>Network ID / receiving wallet</dt><dd>{preflight.preflight.transaction.chainId} / {preflight.preflight.recipient}</dd></dl><details><summary>Transaction details</summary><p>Estimated gas units: {preflight.preflight.gasEstimateRaw??"Not available"}</p><p className="note">{preflight.preflight.policy}</p><p>To: {preflight.preflight.transaction.to}</p><p>Value: 0</p><code style={{overflowWrap:'anywhere'}}>{preflight.preflight.transaction.data}</code><p>Block {preflight.snapshot.blockNumber} · {preflight.snapshot.blockHash}</p></details><WalletAction wallet={wallet} body={preflight} kind="preflight" path={preflight.requestPath} label={side==='buy'?'Buy in wallet':'Sell in wallet'} onFinalized={()=>{setPreflight(null);setQuote(null);setAccountRefresh(n=>n+1);}} /></div>}</section>}
    {quote&&readWallet&&<FeeActionReview token={token} wallet={readWallet} signingWallet={wallet} cursor={cursor} quote={quote} side={side} amount={amount} />}
    <h3>Your balances & fees</h3>{!wallet&&<form className="trade-form" onSubmit={event=>{event.preventDefault();const value=walletInput.trim();if(!/^0x[0-9a-fA-F]{40}$/.test(value)){setAccountError('Enter the full wallet address, starting with 0x.');return;}setInspectedWallet(value);setAccountRefresh(n=>n+1);}}><label>Wallet address to inspect<input aria-label="Wallet address to inspect" value={walletInput} onChange={e=>setWalletInput(e.target.value)} placeholder="0x…" required spellCheck="false" /></label><button className="primary">Inspect wallet</button></form>}<p className="note">{readWallet?`Inspecting ${readWallet}. Viewing an address does not give access to its wallet.`:'Connect a wallet or inspect a public wallet address.'}</p>{accountError&&<div className="message error" role="alert">{accountError}</div>}{!readWallet?<p className="note">Choose a wallet to see its balances, spending approvals and fees available to claim.</p>:accountError?null:!account?<p className="note">Reading wallet state…</p>:<><dl><dt>{token.symbol} balance</dt><dd>{units(account.account.tokenBalanceRaw)}</dd><dt>CHOG balance</dt><dd>{units(account.account.quoteBalanceRaw)}</dd><dt>CHOG spending limit</dt><dd>{units(account.account.quoteAllowanceRaw)}</dd><dt>Token spending limit</dt><dd>{units(account.account.tokenAllowanceRaw)}</dd><dt>Creator fees available</dt><dd>{units(account.account.feeCredits.creatorRaw)} CHOG</dd><dt>Studio fees available</dt><dd>{units(account.account.feeCredits.studioRaw)} CHOG</dd><dt>Platform fees available</dt><dd>{units(account.account.feeCredits.platformRaw)} CHOG</dd></dl><p className="note">These fees belong to the recorded wallet even after an NFT transfer. Review the fees below, then confirm the claim in your wallet.</p><p className="note">Wallet read at block {account.provenance.blockNumber} · {account.provenance.blockTime} · {account.provenance.rpcOrigin}</p></>}
    {readWallet&&<WalletActivity token={token} wallet={readWallet} signingWallet={wallet} cursor={cursor} refresh={accountRefresh} />}
    {readWallet&&<FeeActionReview token={token} wallet={readWallet} signingWallet={wallet} cursor={cursor} />}
  </div>;
}
