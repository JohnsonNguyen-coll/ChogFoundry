import React, { useContext, createContext, useEffect, useState, lazy, Suspense } from "react";
import TradePanel from "./TradePanel.jsx";
import WalletActivity from "./WalletActivity.jsx";
import FeeActionReview from "./FeeActionReview.jsx";
import {Spinner} from './components/Loading.jsx';
import {Link} from 'react-router-dom';
import { units,decimal } from "./market-format.mjs";
import TokenAvatar from './components/TokenAvatar.jsx';

const MarketChart=lazy(()=>import('./components/MarketChart.jsx'));

const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const time = (seconds) =>
  new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19) +
  " UTC";
const MarketChain = createContext(143);
function Address({ value }) {
  const chain = useContext(MarketChain);
  if (value && chain !== 143)
    return <span title={value}>{short(value)} (local fork)</span>;
  return value ? (
    <a
      href={`https://monadscan.com/address/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {short(value)} ↗
    </a>
  ) : (
    "Unavailable"
  );
}
async function request(path, signal) {
  const response = await fetch("/api" + path, { signal: AbortSignal.any([signal,AbortSignal.timeout(25000)]), cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(response.status>=500?"Market data is temporarily unavailable.":data.error?.message || "Market data is unavailable."),{code:data.error?.code});
  return data;
}
function Transaction({ value }) {
  const chain = useContext(MarketChain);
  return chain === 143 ? (
    <a
      href={`https://monadscan.com/tx/${value}`}
      target="_blank"
      rel="noreferrer"
    >
      {short(value)} ↗
    </a>
  ) : (
    <span title={value}>{short(value)} (local fork)</span>
  );
}
export default function MarketView({
  collection,
  onOpenStudio,
  wallet,
  selectedToken,
  onSelectToken,
}) {
  const [tab,setTab]=useState("transactions");
  const [directory, setDirectory] = useState(null),
    [directoryError, setDirectoryError] = useState("");
  const [input, setInput] = useState(""),
    [token, setToken] = useState(""),
    [interval, setIntervalValue] = useState(60);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("idle");
  const [refresh, setRefresh] = useState(0),
    [reset, setReset] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    setDirectory(null);
    setDirectoryError("");
    const poll=()=>request("/tokens", controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {setDirectory(next);setDirectoryError('');}
      })
      .catch((e) => {
        if (!controller.signal.aborted){setDirectory(null);setDirectoryError(e.message);}
      }).finally(()=>{if(!controller.signal.aborted)timer=setTimeout(poll,10000);});
    poll();
    return () => {controller.abort();clearTimeout(timer);};
  }, [refresh]);
  useEffect(() => {
    setData(null);
    setError("");
    setReset(false);
    if (!token) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    let stream, retryTimer, pollTimer, fallback=false, pollHealthy=false,
      active = true;
    const stopPolling=()=>{fallback=false;pollHealthy=false;clearTimeout(pollTimer);};
    const fail = (message) => {
      if (active) {
        stopPolling();
        setData(null);
        setError(message);
        setStatus("unavailable");
        clearTimeout(retryTimer);
        retryTimer=setTimeout(()=>{if(active)setRefresh(n=>n+1);},8000);
      }
    };
    const poll=async()=>{
      try{
        const next=await request(`/tokens/${token}/history?interval=${interval}`,controller.signal);
        if(!active||!fallback)return;
        if(next.token.address.toLowerCase()!==token.toLowerCase()||next.intervalSeconds!==interval)throw Object.assign(new Error('Market response mismatch.'),{code:'MARKET_BINDING_MISMATCH'});
        pollHealthy=true;setData(next);setError('');setStatus('polling');
      }catch(e){
        if(!active||!fallback)return;
        if(['CHAIN_REORG','MARKET_BINDING_MISMATCH','INDEX_REORG_DEPTH','CHAIN_MISMATCH'].includes(e.code)){fail('This market is being reverified after a network change.');return;}
        pollHealthy=false;setStatus('reconnecting');setError('Market updates are delayed. Reconnecting automatically.');
      }finally{if(active&&fallback)pollTimer=setTimeout(poll,5000);}
    };
    const startPolling=()=>{if(!active||fallback)return;fallback=true;pollTimer=setTimeout(poll,500);};
    const replace = (event, reorganized = false) => {
      if (!active) return;
      try {
        const next = JSON.parse(event.data);
        if (
          next.token.address.toLowerCase() !== token.toLowerCase() ||
          next.intervalSeconds !== interval
        )
          throw new Error();
        stopPolling();
        setData(next);
        setError("");
        setStatus("connected");
        setReset(reorganized);
      } catch {
        fail(
          "Market updates could not be loaded. Refresh to reconnect.",
        );
        stream?.close();
      }
    };
    setStatus("loading");
    request(`/tokens/${token}/history?interval=${interval}`, controller.signal)
      .then((initial) => {
        if (!active) return;
        setData(initial);
        setStatus("connecting");
        stream = new EventSource(
          `/api/tokens/${token}/stream?interval=${interval}`,
        );
        stream.addEventListener("snapshot", replace);
        stream.addEventListener("reset", (event) => replace(event, true));
        stream.addEventListener("unavailable", (event) => {
          let message = "Market data is temporarily unavailable.";
          try {
            const failure=JSON.parse(event.data).error;
            if(failure?.code==='MARKET_BINDING_MISMATCH')message='This token’s market could not be verified.';
            if(['INDEX_RPC_FAILED','RPC_POOL_UNAVAILABLE','RPC_READ_FAILED','INDEX_READ_BUSY'].includes(failure?.code)){
              setError('Market updates are delayed. Reconnecting automatically.');setStatus('reconnecting');startPolling();return;
            }
          } catch {}
          fail(message);
          stream.close();
        });
        stream.onerror = () => {
          if (active) {
            if(pollHealthy){setStatus('polling');return;}
            setStatus("reconnecting");
            setError(
              "Live updates interrupted. Showing the last confirmed snapshot while reconnecting.",
            );
            startPolling();
          }
        };
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e.message);
      });
    return () => {
      active = false;
      controller.abort();
      stream?.close();
      clearTimeout(retryTimer);
      stopPolling();
    };
  }, [token, interval, refresh]);
  useEffect(() => {
    if (selectedToken) {
      setInput(selectedToken.address);
      setToken(
        /^0x[0-9a-fA-F]{40}$/.test(selectedToken.address)
          ? selectedToken.address
          : "",
      );
      if (!/^0x[0-9a-fA-F]{40}$/.test(selectedToken.address))
        setError("Invalid token address in this link.");
    } else {
      setInput("");
      setToken("");
    }
  }, [selectedToken]);
  function choose(value) {
    setInput(value);
    setToken(value);
    onSelectToken?.(value);
  }
  function lookup(event) {
    event.preventDefault();
    const value = input.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
      setError("Enter a complete EVM token address.");
      return;
    }
    if (token === value) setRefresh((n) => n + 1);
    else choose(value);
  }
  const tabs=[['transactions','Transactions'],['holders','Holders'],['activity','My activity'],['fees','Claim fees'],['info','Token info']];
  return <section id="markets" className="market-section terminal">
    <header className="terminal-toolbar">
      <div className="terminal-title"><span className="eyebrow">FOUNDRY MARKETS</span><h2>Trading terminal<span className="terminal-chain">Monad</span></h2></div>
      <div className="terminal-tools">
        <label className="market-select-label">Market<select aria-label="Select market" value={token} onChange={e=>choose(e.target.value)}><option value="" disabled>Select a token</option>{directory?.tokens.map(value=><option key={value} value={value}>{directory.assets?.find(a=>a.token.address.toLowerCase()===value.toLowerCase())?.token.symbol||short(value)} / CHOG</option>)}{token&&!directory?.tokens.some(value=>value.toLowerCase()===token.toLowerCase())&&<option value={token}>{short(token)} / CHOG</option>}</select></label>
        <button className="secondary" onClick={()=>setRefresh(n=>n+1)}>Refresh</button>
      </div>
    </header>
    <details className="terminal-lookup"><summary>Find a token by address</summary><form onSubmit={lookup} className="terminal-address-form"><input aria-label="Foundry token address" value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste a Foundry token address" spellCheck="false" required/><button className="secondary">Open market</button></form></details>
    {directoryError&&!token&&<div className="message" role="status">Unable to load the token list. Retrying automatically.</div>}
    {directory&&!directory.tokens.length&&!token&&<div className="empty market-empty"><h3>{directory.index.caughtUp?'Your next launch starts here.':'Loading launch history…'}</h3><p>{directory.index.caughtUp?'Launch a token to open its market, chart and community.':'Markets will appear as their launches are confirmed.'}</p><Link className="primary" to="/app/launch">Launch a token</Link></div>}
    {error&&<div className="message error terminal-error" role="alert"><span>{error} Retrying automatically.</span><button className="text-button" onClick={()=>setRefresh(n=>n+1)}>Retry now</button></div>}
    {(!data&&token&&!error||!directory&&!token&&!directoryError)&&<div className="terminal-loading"><Spinner label="Loading market…"/></div>}
    {reset&&<div className="message" role="status">Trade history was updated after a network change.</div>}
    {data&&(!selectedToken||data.token.address.toLowerCase()===selectedToken.address.toLowerCase())&&<MarketChain.Provider value={data.provenance.chainId}>
      <div className="terminal-market" data-cursor={data.cursor} data-block-hash={data.snapshot.blockHash}>
        <header className="terminal-token-header">
          <div className="terminal-token-identity"><TokenAvatar collection={collection} nftId={data.launch.nftId} name={data.token.name}/><div><h3>{data.token.name}<span>{data.token.symbol} / CHOG</span></h3><div className="terminal-token-links"><Address value={data.token.address}/><button className="text-button" onClick={()=>onOpenStudio(data.launch.nftId)}>Studio #{data.launch.nftId} ↗</button></div></div></div>
          <dl className="terminal-stats"><div><dt title="Current curve or pool price × total token supply. USD uses the latest available CHOG market rate.">Market cap</dt><dd>{data.valuation?.marketCapUsd!=null?`$${decimal(data.valuation.marketCapUsd)}`:"—"}<small className="market-cap-quote">{data.valuation?.marketCapQuote!=null?`${decimal(data.valuation.marketCapQuote)} CHOG`:"Price unavailable"}</small></dd></div><div><dt>Trades</dt><dd>{data.tradeCount.toLocaleString('en-US')}</dd></div><div><dt>Holders</dt><dd>{data.holders?.count?.toLocaleString('en-US')??'—'}</dd></div><div><dt>Market</dt><dd className="market-stage">{data.launch.graduated?'Liquidity pool':'Bonding curve'}</dd></div></dl>
        </header>
        <div className="terminal-grid">
          <div className="terminal-main">
            <section className="terminal-chart-panel" aria-label="Price chart">
              <div className="terminal-chart-toolbar"><div className="chart-intervals" role="group" aria-label="Candle interval">{[[60,'1m'],[300,'5m'],[900,'15m'],[3600,'1h']].map(([value,label])=><button key={value} aria-pressed={interval===value} className={interval===value?'active':''} onClick={()=>setIntervalValue(value)}>{label}</button>)}</div><span className={`market-live ${status==='connected'?'connected':''}`} role="status"><i/>{status==='connected'?(data.provenance.chainId===143?'Live':'Local fork'):status==='polling'?'HTTP updates':status==='connecting'?'Connecting…':'Reconnecting…'}</span></div>
              <div className="chart-pair-label"><strong>{data.token.symbol} / CHOG</strong><span>Trade price · {interval<3600?`${interval/60} min`:'1 hour'}</span></div>
              <Suspense fallback={<div className="chart-module-loading"><Spinner label="Loading chart…"/></div>}><MarketChart candles={data.candles} marketKey={`${data.token.address}:${interval}`}/></Suspense>
              <footer className="chart-footnote"><span>Prices in CHOG · {data.candles.length} recorded candles</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer" title="TradingView Lightweight Charts™ — Copyright (c) 2025 TradingView, Inc.">Charts by TradingView ↗</a></footer>
            </section>
            <section className="terminal-history">
              <div className="terminal-tabs" role="tablist" aria-label="Market information">{tabs.map(([value,label])=><button key={value} id={`market-tab-${value}`} role="tab" aria-selected={tab===value} aria-controls={`market-panel-${value}`} tabIndex={tab===value?0:-1} onKeyDown={e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const i=tabs.findIndex(([key])=>key===value),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next][0]);document.getElementById(`market-tab-${tabs[next][0]}`)?.focus();}} onClick={()=>setTab(value)}>{label}{value==='transactions'&&<span>{data.tradeCount}</span>}{value==='holders'&&data.holders&&<span>{data.holders.count}</span>}</button>)}</div>
              <div className="terminal-tab-content" id={`market-panel-${tab}`} role="tabpanel" aria-labelledby={`market-tab-${tab}`} tabIndex={0}>
                {tab==='transactions'&&<><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Type</th><th>{data.token.symbol}</th><th title="Trade amount before protocol fees">CHOG amount</th><th>Wallet</th><th>Transaction</th></tr></thead><tbody>{[...data.trades].reverse().map(t=><tr key={t.id} data-transaction={t.transactionHash}><td className="trade-time" title={time(t.timestamp)}>{new Date(t.timestamp*1000).toISOString().slice(11,19)}<small>{new Date(t.timestamp*1000).toISOString().slice(0,10)}</small></td><td><span className={`trade-side ${t.side}`}>{t.side==='buy'?'Buy':'Sell'}</span></td><td>{units(t.tokenAmountRaw,data.token.decimals)}</td><td>{units(t.quoteBaseRaw)}</td><td><Address value={t.payer||t.router}/>{!t.payer&&<small>Router · payer unknown</small>}</td><td><Transaction value={t.transactionHash}/></td></tr>)}</tbody></table></div>{!data.trades.length&&<div className="terminal-empty">No trades yet. The first trade starts the chart.</div>}<p className="terminal-table-note">{data.tradesTruncated?'Latest 500 trades. ':''}CHOG amounts exclude protocol fees. <button className="text-button" onClick={()=>setTab('info')}>Data details ↗</button></p></>}
                {tab==='holders'&&<>{data.holders?<><div className="table-scroll"><table><thead><tr><th>#</th><th>Wallet</th><th>Balance</th><th>Supply share</th><th>Type</th></tr></thead><tbody>{data.holders.top.map((h,i)=><tr key={h.wallet}><td>{i+1}</td><td><Address value={h.wallet}/></td><td>{units(h.balanceRaw,data.token.decimals)}</td><td><span className="holder-share">{units(h.shareBps,2)}%<span className="holder-share-track"><i style={{width:`${Math.min(100,Number(h.shareBps)/100)}%`}}/></span></span></td><td>{h.role}</td></tr>)}</tbody></table></div><p className="terminal-table-note">Top {data.holders.top.length} addresses, including market and liquidity contracts.</p></>:<div className="terminal-empty">Holder data is currently unavailable.</div>}</>}
                {tab==='activity'&&(wallet?<WalletActivity token={data.token} wallet={wallet} signingWallet={wallet} cursor={data.cursor}/>:<div className="terminal-empty">Connect your wallet to see your activity for this token.</div>)}
                <div hidden={tab!=='fees'}>{wallet?<FeeActionReview token={data.token} wallet={wallet} signingWallet={wallet} cursor={data.cursor}/>:<div className="terminal-empty">Connect your wallet to view and claim your fees.</div>}</div>
                {tab==='info'&&<div className="terminal-info"><h3>Token details</h3><dl><dt>Token contract</dt><dd><Address value={data.token.address}/></dd><dt>Original creator</dt><dd><Address value={data.launch.creator}/></dd><dt>Fee vault</dt><dd><Address value={data.launch.vault}/></dd><dt>Total supply</dt><dd>{data.token.supplyRaw?`${units(data.token.supplyRaw,data.token.decimals)} ${data.token.symbol}`:"Unavailable"}</dd><dt>Circulating supply</dt><dd>{data.token.circulatingSupplyRaw!=null?`${units(data.token.circulatingSupplyRaw,data.token.decimals)} ${data.token.symbol}`:"Unavailable"}</dd><dt>History status</dt><dd>{data.index.caughtUp?'Up to date':'Syncing'}</dd></dl><details><summary>Data sources and trade attribution</summary><p>Trades and candles come from confirmed onchain transactions. Empty time intervals are not filled with made-up prices. Holders include protocol contracts.</p><p>{data.priceUnit}</p><p>Market cap uses the current curve or pool price and total supply, including tokens in the market and liquidity reserves.</p><p>Price source: {data.valuation?.priceSource??"Unavailable"}. USD conversion: {data.valuation?.quoteUsd?.status==="available"?`${data.valuation.quoteUsd.source}, CHOG/USD ${decimal(data.valuation.quoteUsd.priceUsd)}, read ${data.valuation.quoteUsd.fetchedAt}`:"Unavailable; no USD value is assumed."}</p><p>{data.attributionSummary?.policy}</p><p>Holder status: {data.holderStatus}</p><p>Some routes do not identify the sending or receiving wallet. Unresolved v4 trades: {data.attributionSummary?.unresolvedV4??'Unavailable'}.</p><p>{data.provenance.source} · {data.provenance.finality} · chain {data.provenance.chainId}</p><p>Block {data.provenance.blockNumber} · {data.provenance.blockTime}</p><code>{data.provenance.blockHash}</code><p>Read at {data.provenance.fetchedAt}</p><p>Indexed blocks {data.range.fromBlock}–{data.range.toBlock}</p><p>{data.candlesTruncated?'Latest 500 populated candle intervals.':'All recorded candles.'}</p></details></div>}
              </div>
            </section>
          </div>
          <div className="terminal-sidebar"><TradePanel key={data.token.address} token={data.token} wallet={wallet} cursor={data.cursor}/><div className="terminal-sidebar-note"><span className="eyebrow">YOUR CHOG. YOUR NEXT LAUNCH.</span><p>Every trade supports this token’s creator and studio.</p><button className="text-button" onClick={()=>onOpenStudio(data.launch.nftId)}>Visit studio #{data.launch.nftId} ↗</button></div></div>
        </div>
      </div>
    </MarketChain.Provider>}
  </section>;
}
