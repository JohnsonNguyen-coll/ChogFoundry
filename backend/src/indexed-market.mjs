import { ZeroAddress } from 'ethers';
import { buildCandles } from './market-data.mjs';
import { AppError } from './validation.mjs';

export function buildIndexedMarket(windows,head,revision,intervalSeconds) {
  const latest=windows.at(-1);
    const trades=windows.flatMap(w=>w.trades),transfers=windows.flatMap(w=>w.transfers);
    if(trades.length>100000||transfers.length>100000) throw new AppError(503,'INDEX_QUERY_LIMIT','This market exceeds the current local event budget.');
    if(new Set(trades.map(t=>t.id)).size!==trades.length||new Set(transfers.map(t=>t.id)).size!==transfers.length) throw new AppError(503,'INDEX_DUPLICATE','Indexed events are inconsistent.');
    const balances=new Map();let minted=0n;
    for(const t of transfers) {
      const n=BigInt(t.valueRaw),from=t.from.toLowerCase(),to=t.to.toLowerCase();
      if(from===ZeroAddress) minted+=n;else balances.set(from,(balances.get(from)||0n)-n);
      if(to!==ZeroAddress) balances.set(to,(balances.get(to)||0n)+n);
    }
    const supply=BigInt(latest.token.supplyRaw);
    if(minted!==supply||[...balances.values()].some(b=>b<0n)||[...balances.values()].reduce((a,b)=>a+b,0n)!==supply) throw new AppError(503,'HOLDER_HISTORY_INCOMPLETE','The index does not contain a complete mint-to-checkpoint transfer history.');
    const entries=[...balances].filter(([,b])=>b>0n).sort((a,b)=>a[1]===b[1]?a[0].localeCompare(b[0]):a[1]>b[1]?-1:1);
    const role=wallet=>wallet===latest.launch.market.toLowerCase()?'curve':wallet===latest.pool?.liquidityLock.toLowerCase()?'liquidity-lock':wallet===latest.pool?.manager.toLowerCase()?'pool-manager':wallet===latest.launch.factory.toLowerCase()?'factory':'unclassified';
    const candles=buildCandles(trades,intervalSeconds);
    const {transfers:ignored,...meta}=latest;
    return {...meta,range:{fromBlock:windows[0].range.fromBlock,toBlock:head.end_block,completeHistory:true},intervalSeconds,
      trades:trades.slice(-500),tradeCount:trades.length,tradesTruncated:trades.length>500,candles:candles.slice(-500),candleCount:candles.length,candlesTruncated:candles.length>500,
      holders:{count:entries.length,includesProtocolContracts:true,top:entries.slice(0,50).map(([wallet,balance])=>({wallet,balanceRaw:String(balance),shareBps:String(balance*10000n/supply),role:role(wallet)}))},
      holderStatus:'complete canonical mint-to-checkpoint replay; balances derived from transfer logs',cursor:`${revision}:${head.end_hash}`};
}
