import { ZeroAddress, getAddress } from 'ethers';
import { buildCandles } from './market-data.mjs';
import { AppError } from './validation.mjs';

export function buildIndexedMarket(windows,head,revision,intervalSeconds,wallet=null) {
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
    const v4=trades.filter(t=>t.stage==='v4');
    const matched=v4.filter(t=>t.attribution?.method==='foundry-lock-pool-trade').length;
    const attributionSummary={scope:'Entire indexed history',officialV4Matched:matched,unresolvedV4:v4.length-matched,legacyV4Rows:v4.filter(t=>!t.attribution).length,policy:'Payer and recipient are event-recorded addresses, not beneficial owners or people. Unsupported or ambiguous routes remain unknown.'};
    let walletActivity=null;
    if(wallet){
      wallet=getAddress(wallet);const key=wallet.toLowerCase();
      const matches=value=>value?.toLowerCase()===key;
      const relatedTrades=trades.filter(t=>matches(t.payer)||matches(t.recipient)).map(t=>({...t,walletRoles:[...(matches(t.payer)?['payer']:[]),...(matches(t.recipient)?['recipient']:[])]}));
      const relatedTransfers=transfers.filter(t=>matches(t.from)||matches(t.to));
      const incoming=relatedTransfers.reduce((n,t)=>n+(matches(t.to)?BigInt(t.valueRaw):0n),0n);
      const outgoing=relatedTransfers.reduce((n,t)=>n+(matches(t.from)?BigInt(t.valueRaw):0n),0n);
      const balance=balances.get(key)||0n;
      if(incoming-outgoing!==balance)throw new AppError(503,'WALLET_REPLAY_MISMATCH','Wallet transfer replay is inconsistent.');
      walletActivity={wallet,balanceRaw:String(balance),shareBps:String(balance*10000n/supply),
        incomingTokenRaw:String(incoming),outgoingTokenRaw:String(outgoing),
        relatedTradeCount:relatedTrades.length,buyCount:relatedTrades.filter(t=>t.side==='buy').length,sellCount:relatedTrades.filter(t=>t.side==='sell').length,
        trades:relatedTrades.slice(-100),tradesTruncated:relatedTrades.length>100,
        transferCount:relatedTransfers.length,transfers:relatedTransfers.slice(-100),transfersTruncated:relatedTransfers.length>100,
        unresolvedV4Trades:attributionSummary.unresolvedV4,legacyV4Rows:attributionSummary.legacyV4Rows,
        pnlRaw:null,costBasisRaw:null,tradeHistoryComplete:false,
        scope:'Selected Foundry token, mint through the indexed canonical checkpoint. Transfers include gifts and protocol flows. Related trades require recorded payer or recipient; unresolved routes and external pools are not wallet history.',
        policy:'Public inspection grants no authority. Payer and recipient roles are distinct; transfers and third-party payments cannot establish cost basis or profit.'};
    }
    const {transfers:ignored,...meta}=latest;
    return {...meta,range:{fromBlock:windows[0].range.fromBlock,toBlock:head.end_block,completeHistory:true},intervalSeconds,
      ...(walletActivity?{walletActivity}:{}),attributionSummary,trades:trades.slice(-500),tradeCount:trades.length,tradesTruncated:trades.length>500,candles:candles.slice(-500),candleCount:candles.length,candlesTruncated:candles.length>500,
      holders:{count:entries.length,includesProtocolContracts:true,top:entries.slice(0,50).map(([wallet,balance])=>({wallet,balanceRaw:String(balance),shareBps:String(balance*10000n/supply),role:role(wallet)}))},
      holderStatus:'complete canonical mint-to-checkpoint replay; balances derived from transfer logs',cursor:`${revision}:${head.end_hash}`};
}
