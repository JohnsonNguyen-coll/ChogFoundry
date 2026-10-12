import { getAddress, ZeroAddress } from 'ethers';
import { buildIndexedMarket } from './indexed-market.mjs';
import { AppError } from './validation.mjs';
export const portfolioCapacity={maxWindows:5000,maxEvents:100000,maxTokens:200};
export function buildWalletPortfolio(windows,head,revision,wallet){
  wallet=getAddress(wallet);
  if(wallet===ZeroAddress)throw new AppError(400,'WALLET_REQUIRED','Inspect a nonzero wallet.');
  if(!head)throw new AppError(503,'INDEX_NOT_READY','No canonical portfolio checkpoint is available.');
  const groups=new Map();let eventCount=0;
  if(windows.length>portfolioCapacity.maxWindows)throw new AppError(503,'PORTFOLIO_CAPACITY','Portfolio window capacity exceeded; no partial result is returned.');
  for(const window of windows){
    eventCount+=window.trades.length+window.transfers.length;
    if(eventCount>portfolioCapacity.maxEvents)throw new AppError(503,'PORTFOLIO_CAPACITY','Portfolio event capacity exceeded; no partial result is returned.');
    const key=window.token.address.toLowerCase();
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(window);
  }
  if(groups.size>portfolioCapacity.maxTokens)throw new AppError(503,'PORTFOLIO_CAPACITY','Portfolio token capacity exceeded.');
  const positions=[];let unresolved=0,legacy=0;
  for(const history of groups.values()){
    const latest=history.at(-1);
    if(latest.snapshot.blockNumber!==head.end_block||latest.snapshot.blockHash!==head.end_hash)throw new AppError(503,'PORTFOLIO_CHECKPOINT_MISMATCH','Token windows do not share the portfolio checkpoint.');
    const market=buildIndexedMarket(history,head,revision,60,wallet),activity=market.walletActivity;
    unresolved+=market.attributionSummary.unresolvedV4;legacy+=market.attributionSummary.legacyV4Rows;
    if(BigInt(activity.balanceRaw)>0n||activity.transferCount>0||activity.relatedTradeCount>0){
      const {trades,transfers,...summary}=activity;
      positions.push({token:market.token,launch:market.launch,range:market.range,activity:summary});
    }
  }
  return {wallet,positions,indexedTokenCount:groups.size,holdingTokenCount:positions.filter(p=>BigInt(p.activity.balanceRaw)>0n).length,
    unresolvedV4AcrossIndex:unresolved,legacyV4AcrossIndex:legacy,
    snapshot:{blockNumber:head.end_block,blockHash:head.end_hash,blockTime:head.block_time},cursor:`${revision}:${head.end_hash}`,
    capacity:{...portfolioCapacity,scannedWindows:windows.length,scannedEvents:eventCount},pnlRaw:null,costBasisRaw:null,executionEnabled:false,
    scope:'All tokens in this configured Foundry factory index through one canonical checkpoint. Unindexed launches, external pools and unresolved routes are excluded. Zero-balance positions retain recorded activity.',
    policy:'Token quantities are not summed across assets. No USD valuation, cost basis or profit is inferred. Public inspection grants no signing or studio authority.'};
}
