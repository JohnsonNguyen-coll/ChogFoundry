import React, { useEffect, useState } from 'react';
import { units } from './market-format.mjs';
export default function WalletActivity({token,wallet,cursor,refresh}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    (async()=>{
      try{
        const response=await fetch(`/api/tokens/${token.address}/wallet-history?wallet=${encodeURIComponent(wallet)}`,{signal:controller.signal,cache:'no-store'}),body=await response.json();
        if(!response.ok)throw new Error(body.error?.message||'Indexed wallet activity unavailable.');
        if(!controller.signal.aborted)setData(body);
      }catch(e){if(!controller.signal.aborted)setError(e.message);}
    })();return()=>controller.abort();
  },[token.address,wallet,cursor,refresh]);
  const activity=data?.walletActivity;
  return <section className="wallet-activity" data-wallet-cursor={data?.cursor}><h3>Wallet token activity</h3>{error?<div className="message" role="status">{error}</div>:!activity?<p className="note">Reading canonical wallet history…</p>:<><dl><dt>Indexed token balance</dt><dd>{units(activity.balanceRaw)} {token.symbol}</dd><dt>Supply share</dt><dd>{units(activity.shareBps,2)}%</dd><dt>Related buys / sells</dt><dd>{activity.buyCount} / {activity.sellCount}</dd><dt>Token transfers in / out</dt><dd>{units(activity.incomingTokenRaw)} / {units(activity.outgoingTokenRaw)}</dd><dt>Cost basis / PnL</dt><dd>Unavailable: economic history is incomplete</dd></dl><p className="note">{activity.scope} {activity.policy}</p><p className="note">{activity.unresolvedV4Trades} unresolved v4 trades across this token; these cannot be assigned to this wallet. {activity.legacyV4Rows} legacy rows. {data.index.caughtUp?'Caught up to the observed canonical head.':'Index catch-up is in progress.'}</p><details><summary>Recorded wallet trades ({activity.relatedTradeCount})</summary><p className="note">{activity.tradesTruncated?'Latest 100 related trades; older rows omitted.':'All attributable related trades through this checkpoint.'} Payer and recipient can differ.</p><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Side</th><th>Wallet role</th><th>Tokens</th><th>Transaction</th></tr></thead><tbody>{[...activity.trades].reverse().map(t=><tr key={t.id} data-wallet-transaction={t.transactionHash}><td>{new Date(t.timestamp*1000).toISOString()}</td><td>{t.side}</td><td>{t.walletRoles.join(' + ')}</td><td>{units(t.tokenAmountRaw)}</td><td><code>{t.transactionHash}</code></td></tr>)}</tbody></table></div></details><details><summary>Token transfers ({activity.transferCount})</summary><p className="note">{activity.transfersTruncated?'Latest 100 transfers; older rows omitted.':'All wallet transfers through this checkpoint.'} Transfers are not assumed to be purchases or sales.</p><div className="table-scroll"><table><thead><tr><th>From</th><th>To</th><th>Tokens</th></tr></thead><tbody>{[...activity.transfers].reverse().map(t=><tr key={t.id}><td><code>{t.from}</code></td><td><code>{t.to}</code></td><td>{units(t.valueRaw)}</td></tr>)}</tbody></table></div></details><p className="note">Block {data.provenance.blockNumber} · {data.provenance.finality} · {data.provenance.rpcOrigin}</p><code style={{overflowWrap:'anywhere'}}>{data.snapshot.blockHash}</code></>}</section>;
}
