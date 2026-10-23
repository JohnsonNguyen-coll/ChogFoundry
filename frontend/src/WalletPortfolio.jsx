import React, { useEffect, useState } from 'react';
import { units } from './market-format.mjs';
import {short} from './lib/api.mjs';
import {Spinner} from './components/Loading.jsx';
import PaginatedList from './components/PaginatedList.jsx';
export default function WalletPortfolio({wallet,onOpenToken}){
  const [input,setInput]=useState(''),[inspected,setInspected]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const selected=wallet||inspected;
  useEffect(()=>{
    const controller=new AbortController();let timer;
    setData(null);setError('');
    if(!selected)return()=>controller.abort();
    const poll=async()=>{
      try{
        const response=await fetch(`/api/wallets/${selected}/portfolio`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),cache:'no-store'}),body=await response.json();
        if(!response.ok)throw new Error(body.error?.message||'Portfolio unavailable.');
        if(!controller.signal.aborted){setData(body);setError('');}
      }catch(e){if(!controller.signal.aborted){setData(null);setError(e.message);}}
      finally{if(!controller.signal.aborted)timer=setTimeout(poll,10000);}
    };
    poll();return()=>{controller.abort();clearTimeout(timer);};
  },[selected,refresh]);
  return <section id="portfolio" className="market-section portfolio-view" data-portfolio-cursor={data?.cursor}>
    <div className="section-heading">
      <div><span className="eyebrow">YOUR PORTFOLIO</span><h2>Token holdings</h2></div>
      <button className="text-button" disabled={!selected} onClick={()=>setRefresh(n=>n+1)}>Refresh</button>
    </div>
    {!wallet&&<form className="lookup" onSubmit={e=>{
      e.preventDefault();const value=input.trim();
      if(!/^0x[0-9a-fA-F]{40}$/.test(value)||/^0x0{40}$/i.test(value)){setData(null);setError('Enter a nonzero EVM wallet address.');return;}
      setInspected(value);setRefresh(n=>n+1);
    }}><label htmlFor="portfolio-wallet">Public wallet address</label><div><input id="portfolio-wallet" value={input} onChange={e=>setInput(e.target.value)} placeholder="0x…" spellCheck="false" required/><button className="primary">View portfolio</button></div></form>}
    <p className="portfolio-wallet-label">{selected?<><span title={selected}>{short(selected)}</span><span>Foundry tokens on Monad</span></>:'Connect a wallet or enter an address.'}</p>
    {error?<div className="message" role="alert">{error}</div>:selected&&!data?<div className="section-loading"><Spinner label="Loading portfolio…"/></div>:data&&<>
      <div className="portfolio-stats">
        <div><span>Tokens held</span><strong>{data.holdingTokenCount}</strong></div>
        <div><span>Tokens with activity</span><strong>{data.positions.length}</strong></div>
        <div><span>Data status</span><strong className={data.index.caughtUp?'portfolio-synced':''}>{data.index.caughtUp?'Up to date':'Syncing…'}</strong></div>
      </div>
      {(data.unresolvedV4AcrossIndex>0||data.legacyV4AcrossIndex>0)&&<p className="note">Some trade history is incomplete. See data details below.</p>}
      {data.positions.length?<PaginatedList items={data.positions} pageSize={15} resetKey={selected} label="Portfolio tokens">{page=><div className="table-scroll"><table><thead><tr><th>Token</th><th>Holdings</th><th>Supply share</th><th>Buys / sells</th><th>Studio</th><th>Market</th></tr></thead><tbody>{page.map(p=><tr key={p.token.address} data-portfolio-token={p.token.address}><td>{p.token.name} / {p.token.symbol}<small><code>{p.token.address}</code></small></td><td>{units(p.activity.balanceRaw,p.token.decimals)}</td><td>{units(p.activity.shareBps,2)}%</td><td>{p.activity.buyCount} / {p.activity.sellCount}</td><td>Studio #{p.launch.nftId}</td><td><button className="text-button" onClick={()=>onOpenToken(p.token.address)}>View market</button></td></tr>)}</tbody></table></div>}</PaginatedList>:
      <div className="portfolio-empty"><span className="eyebrow">ROOM FOR YOUR NEXT FIND</span><h3>No tokens here yet</h3><p>{data.index.caughtUp?'Your Foundry holdings and trading activity will appear here.':'Your holdings will appear as launch history syncs.'}</p></div>}
      <details className="portfolio-details note"><summary>Data & source details</summary>
        <p>{data.indexedTokenCount} tokens scanned · {data.unresolvedV4AcrossIndex} unresolved v4 trades · {data.legacyV4AcrossIndex} legacy rows. Cost basis and PnL are unavailable.</p>
        <p>{data.scope} {data.policy}</p>
        <p>Wallet: {selected}</p>
        <p>Chain {data.provenance.chainId} · {data.provenance.finality} · block {data.snapshot.blockNumber} · {data.snapshot.blockTime}</p>
        <code>{data.snapshot.blockHash}</code>
        <p>{data.provenance.source} · {data.provenance.rpcOrigin} · read {data.provenance.fetchedAt}</p>
        <p>{data.capacity.scannedWindows} windows / {data.capacity.maxWindows} · {data.capacity.scannedEvents} events / {data.capacity.maxEvents}. Capacity errors return no partial holdings.</p>
      </details>
    </>}
  </section>;
}
