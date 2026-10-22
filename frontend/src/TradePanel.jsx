import React,{useEffect,useRef,useState} from 'react';
import {Spinner} from './components/Loading.jsx';
import {parseAmount,units} from './market-format.mjs';
import {useSelectedWallet} from './WalletProvider.jsx';
import useTrackedTransaction from './hooks/useTrackedTransaction.js';
import {pendingFor,terminalTransaction} from './transaction-journal.mjs';
import {actionRead,sendWalletAction} from './wallet-action.mjs';
import {prepareDirectTrade} from './direct-trade.mjs';

export default function TradePanel({token,wallet,marketVersion,onConfirmed}){
  const {provider}=useSelectedWallet();
  const [side,setSide]=useState('buy'),[amount,setAmount]=useState(''),[slippage,setSlippage]=useState('0.5');
  const [quote,setQuote]=useState(null),[quoting,setQuoting]=useState(false),[quoteError,setQuoteError]=useState('');
  const [account,setAccount]=useState(null),[accountError,setAccountError]=useState(false),[accountRefresh,setAccountRefresh]=useState(0);
  const [phase,setPhase]=useState('idle'),[error,setError]=useState(''),[completedHash,setCompletedHash]=useState(null);
  const intent=useRef(null),lifecycle=useRef(null),running=useRef(false);
  const identity=useRef(null);identity.current={wallet,provider,token:token.address};
  const tracking=useTrackedTransaction(confirmed=>{
    const current=intent.current;
    if(!current||current.hash!==confirmed.hash||!sameContext(current))return;
    setAccountRefresh(n=>n+1);
    if(current.kind==='approval'){void execute(current);}
    else{intent.current=null;setPhase('idle');setCompletedHash(confirmed.hash);setQuote(null);onConfirmed?.(confirmed);}
  });
  function sameContext(current){return current.wallet===identity.current.wallet&&current.provider===identity.current.provider&&current.token===identity.current.token;}
  // Coalesce busy-market events instead of aborting requests on every new block.
  const marketRefresh=useRef({});
  useEffect(()=>{
    marketRefresh.current.account?.();marketRefresh.current.quote?.();
  },[marketVersion]);
  useEffect(()=>{
    const controller=new AbortController();lifecycle.current=controller;intent.current=null;running.current=false;
    setPhase('idle');setError('');setCompletedHash(null);
    return()=>{controller.abort();intent.current=null;};
  },[token.address,wallet,provider]);
  useEffect(()=>{
    const tx=tracking.transaction;
    if(tx&&terminalTransaction(tx.status)&&!['finalized','approval-changed'].includes(tx.status)&&intent.current?.hash===tx.hash){
      intent.current=null;setPhase('idle');setError(tx.status==='reverted'?'The transaction failed. No further transaction was sent.':'The transaction was replaced. Check wallet activity before trying again.');
    }
  },[tracking.transaction]);
  useEffect(()=>{
    const controller=new AbortController();let timer,failures=0,inFlight=false,again=false;setAccount(null);setAccountError(false);
    const poll=async()=>{
      if(intent.current){timer=setTimeout(poll,1000);return;}
      inFlight=true;
      try{const data=await actionRead(`/api/tokens/${token.address}/account?wallet=${encodeURIComponent(wallet)}`,controller.signal);if(!controller.signal.aborted){failures=0;setAccount(data);setAccountError(false);}}
      catch{if(!controller.signal.aborted){failures++;setAccount(null);setAccountError(true);}}
      finally{inFlight=false;if(!controller.signal.aborted){timer=setTimeout(poll,again?0:failures?Math.min(15000,3000*failures):5000);again=false;}}
    };
    const refresh=()=>{if(!wallet)return;if(inFlight)again=true;else{clearTimeout(timer);void poll();}};
    marketRefresh.current.account=refresh;
    if(wallet)void poll();return()=>{controller.abort();clearTimeout(timer);if(marketRefresh.current.account===refresh)delete marketRefresh.current.account;};
  },[token.address,wallet,accountRefresh]);
  useEffect(()=>{
    const controller=new AbortController();let timer,inFlight=false,again=false;setQuote(null);setQuoteError('');setQuoting(false);
    try{parseAmount(amount);}catch{return()=>controller.abort();}
    const poll=async()=>{
      if(intent.current){timer=setTimeout(poll,1000);return;}
      inFlight=true;
      setQuoting(true);
      try{const query=new URLSearchParams({side,amountRaw:parseAmount(amount)});if(wallet)query.set('wallet',wallet);
        const result=await actionRead(`/api/tokens/${token.address}/quote?${query}`,controller.signal);if(!controller.signal.aborted){setQuote(result);setQuoteError('');}
      }catch(e){if(!controller.signal.aborted){setQuote(null);setQuoteError(e.message);}}
      finally{inFlight=false;if(!controller.signal.aborted){setQuoting(false);timer=setTimeout(poll,again?0:5000);again=false;}}
    };
    const refresh=()=>{if(inFlight)again=true;else{clearTimeout(timer);timer=setTimeout(poll,400);}};
    marketRefresh.current.quote=refresh;
    timer=setTimeout(poll,400);
    return()=>{clearTimeout(timer);controller.abort();if(marketRefresh.current.quote===refresh)delete marketRefresh.current.quote;};
  },[token.address,wallet,side,amount,accountRefresh]);
  async function execute(current){
    if(running.current||!sameContext(current)||intent.current!==current)return;
    running.current=true;setError('');setPhase('preparing');
    const signal=lifecycle.current.signal;
    try{
      const [prepared,permission]=await Promise.all([
        prepareDirectTrade({...current,signal,read:actionRead}),actionRead('/api/execution',signal)
      ]);
      signal.throwIfAborted();if(intent.current!==current||!sameContext(current))return;
      setQuote(prepared.quote);
      if(prepared.kind==='approval'&&current.approvals>=3)throw new Error('Spending approval is still insufficient. Check your wallet’s approved amount before trying again.');
      current.kind=prepared.kind;
      const result=await sendWalletAction({provider:current.provider,wallet:current.wallet,...prepared,permission,signal,onState:state=>{
        if(signal.aborted)return;
        if(state.status==='awaiting-wallet')setPhase(prepared.kind==='approval'?'approve-wallet':'trade-wallet');
        else if(state.status==='simulating-current-state')setPhase('simulating');
      }});
      current.hash=result.hash;if(prepared.kind==='approval')current.approvals++;
      tracking.track(result);if(!signal.aborted)setPhase(prepared.kind==='approval'?'approval-pending':'trade-pending');
    }catch(e){if(!signal.aborted){intent.current=null;setError(e.message);setPhase('idle');}}
    finally{running.current=false;}
  }
  function trade(event){
    event.preventDefault();if(running.current||tracking.pending||pendingFor(wallet)||phase!=='idle')return;
    if(!wallet||!provider){setError('Connect your wallet to trade.');return;}
    const current={token:token.address,wallet,provider,side,amount,slippage,approvals:0};
    intent.current=current;setCompletedHash(null);void execute(current);
  }
  const locked=phase!=='idle'||tracking.pending;
  const labels={'preparing':'Checking price and balance…','simulating':'Checking transaction…','approve-wallet':'Confirm approval in your wallet…','trade-wallet':'Confirm trade in your wallet…','approval-pending':'Waiting for approval…','trade-pending':'Waiting for confirmation…'};
  const tx=tracking.transaction,showTransaction=tx?.hash&&intent.current?.hash===tx.hash;
  return <aside className="trade-panel terminal-order">
    <div className="order-heading"><span className="eyebrow">PLACE A TRADE</span><span className="order-network">Monad</span></div>
    <div className="order-sides" role="group" aria-label="Trade side">{['buy','sell'].map(value=><button type="button" key={value} disabled={locked} className={side===value?`selected ${value}`:''} aria-pressed={side===value} onClick={()=>{setSide(value);setError('');setCompletedHash(null);}}>{value==='buy'?'Buy':'Sell'}</button>)}</div>
    <form onSubmit={trade} className="order-form">
      <div className="order-amount-heading"><label htmlFor="trade-amount">{side==='buy'?'You pay':'You sell'}</label><span>{side==='buy'?'CHOG':token.symbol}</span></div>
      <input id="trade-amount" value={amount} onChange={e=>{setAmount(e.target.value);setError('');setCompletedHash(null);}} disabled={locked} inputMode="decimal" placeholder="0.00" required autoComplete="off"/>
      <div className="order-balance"><span>Available</span><span>{account?`${units(side==='buy'?account.account.quoteBalanceRaw:account.account.tokenBalanceRaw)} ${side==='buy'?'CHOG':token.symbol}`:wallet?(accountError?'Unavailable':'Loading…'):'Connect your wallet'}</span></div>
      <div className="order-estimate"><span>Estimated received</span><strong>{quote?`${units(quote.quote.outputRaw)} ${side==='buy'?token.symbol:'CHOG'}`:quoting?<Spinner label="Getting price…"/>:'—'}</strong>{quote&&<small>Protocol fee: {units(quote.quote.totalFeeRaw)} CHOG{quote.quote.stage==='v4'?' · Pool fee included in the quoted price':''}</small>}</div>
      <details className="order-settings"><summary>Price protection <span>{slippage}%</span></summary><label>Maximum price change (%)<input aria-label="Maximum price change" value={slippage} onChange={e=>setSlippage(e.target.value)} disabled={locked} inputMode="decimal"/></label></details>
      <button className={`primary order-submit ${side}`} disabled={locked||!wallet||!amount||!!pendingFor(wallet)}>{locked?<Spinner label={labels[phase]||'Waiting for confirmation…'}/>:side==='buy'?`Buy ${token.symbol}`:`Sell ${token.symbol}`}</button>
    </form>
    {showTransaction&&<p className="order-transaction"><a href={`https://monadscan.com/tx/${tx.hash}`} target="_blank" rel="noreferrer">View {intent.current.kind==='approval'?'approval':'trade'} ↗</a></p>}
    {tx?.trackingError&&showTransaction&&<div className="message" role="status">{tx.trackingPaused?'Transaction verification needs attention. Check wallet activity before continuing.':'Confirmation updates are delayed. Reconnecting automatically.'}</div>}
    {completedHash&&<div className="message" role="status">Trade confirmed. <a href={`https://monadscan.com/tx/${completedHash}`} target="_blank" rel="noreferrer">View transaction ↗</a></div>}
    {error&&<div className="message error" role="alert">{error}</div>}
    {quoteError&&!error&&<p className="note" role="status">The estimate is unavailable. We will fetch a fresh price when you trade.</p>}
    {!wallet&&<p className="note">Connect your wallet using the button in the navigation bar to trade.</p>}
    <p className="order-help">Confirm in your wallet. If needed, approve spending first; your trade follows automatically.</p>
    <div className="order-wallet"><span>Your {token.symbol}</span><strong>{account?units(account.account.tokenBalanceRaw):'—'}</strong><span>Your CHOG</span><strong>{account?units(account.account.quoteBalanceRaw):'—'}</strong></div>
  </aside>;
}
