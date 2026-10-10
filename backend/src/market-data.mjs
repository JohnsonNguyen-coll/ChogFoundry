import { AbiCoder, Contract, Interface, ZeroAddress, ZeroHash, formatUnits, getAddress, keccak256 } from 'ethers';
import { AppError } from './validation.mjs';

const identity = ['function collection() view returns(address)', 'function quote() view returns(address)'];
const factoryAbi = [...identity, 'function market() view returns(address)', 'function feeVault() view returns(address)'];
const vaultAbi = [...identity, 'function registrar() view returns(address)', 'function launchForToken(address) view returns(bytes32)', 'function launches(bytes32) view returns(address token,uint256 nftId,address creator,address curveRecorder,address graduatedRecorder)'];
const curveAbi = [...identity, 'function factory() view returns(address)', 'function graduationAdapter() view returns(address)', 'function curves(address) view returns(bytes32 launchId,address vault,uint256 sold,uint256 reserve,bool graduated)', 'event Traded(address indexed token,address indexed payer,address indexed recipient,bool buySide,uint256 tokenAmount,uint256 baseQuote,uint256 totalFee,uint256 sold,uint256 reserve)'];
const tokenAbi = ['function name() view returns(string)', 'function symbol() view returns(string)', 'function decimals() view returns(uint8)', 'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)', 'event Transfer(address indexed from,address indexed to,uint256 value)'];
const swapInterface = new Interface(['event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)']);
const same = (a,b) => a.toLowerCase() === b.toLowerCase();
const absolute = n => n < 0n ? -n : n;
const order = (a,b) => a.blockNumber-b.blockNumber || a.transactionIndex-b.transactionIndex || a.logIndex-b.logIndex;
const fail = () => { throw new AppError(503,'MARKET_BINDING_MISMATCH','The configured factory, token and market bindings do not match.'); };

// Integer execution prices: CHOG per token, with 36 fractional digits. No USD inference.
export function buildCandles(trades, intervalSeconds) {
  const buckets = new Map();
  for (const t of [...trades].sort(order)) {
    const time = Math.floor(t.timestamp/intervalSeconds)*intervalSeconds;
    const price = BigInt(t.quoteBaseRaw)*10n**36n/BigInt(t.tokenAmountRaw);
    let c = buckets.get(time);
    if (!c) { c={time,open:price,high:price,low:price,close:price,tokenVolume:0n,quoteVolume:0n,count:0}; buckets.set(time,c); }
    c.high=c.high>price?c.high:price; c.low=c.low<price?c.low:price; c.close=price;
    c.tokenVolume+=BigInt(t.tokenAmountRaw); c.quoteVolume+=BigInt(t.quoteBaseRaw); c.count++;
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time).map(c=>({time:c.time,open:formatUnits(c.open,36),high:formatUnits(c.high,36),low:formatUnits(c.low,36),close:formatUnits(c.close,36),tokenVolumeRaw:String(c.tokenVolume),quoteVolumeRaw:String(c.quoteVolume),tradeCount:c.count}));
}

// Bounded canonical window, not a durable indexer or a complete market history.
// provider is the real backend RPC provider; fork tests use a child-owned real-state node.
export async function readMarketWindow(provider,{factoryAddress,tokenAddress,collection,quote,fromBlock,toBlock,intervalSeconds=60,includeTransfers=false}) {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock<0 || fromBlock>toBlock || toBlock-fromBlock>=100) throw new AppError(400,'INVALID_BLOCK_RANGE','Market windows support at most 100 blocks.');
  if (![60,300,900,3600].includes(intervalSeconds)) throw new AppError(400,'INVALID_INTERVAL','Use a candle interval of 60, 300, 900 or 3600 seconds.');
  factoryAddress=getAddress(factoryAddress); tokenAddress=getAddress(tokenAddress);
  const endBlock=await provider.getBlock(toBlock);
  if (!endBlock?.hash) throw new AppError(503,'BLOCK_UNAVAILABLE','Market snapshot block is unavailable.');
  const blockTag=toBlock, at={blockTag};
  if (await provider.getCode(factoryAddress,blockTag)==='0x' || await provider.getCode(tokenAddress,blockTag)==='0x') fail();
  const factory=new Contract(factoryAddress,factoryAbi,provider);
  const [marketAddress,vaultAddress,fc,fq]=await Promise.all([factory.market(at),factory.feeVault(at),factory.collection(at),factory.quote(at)]);
  if (!same(fc,collection)||!same(fq,quote)) fail();
  const market=new Contract(marketAddress,curveAbi,provider), vault=new Contract(vaultAddress,vaultAbi,provider), token=new Contract(tokenAddress,tokenAbi,provider);
  const [mf,mc,mq,vr,vc,vq,launchId,curve,decimals,supply,name,symbol,adapter]=await Promise.all([market.factory(at),market.collection(at),market.quote(at),vault.registrar(at),vault.collection(at),vault.quote(at),vault.launchForToken(tokenAddress,at),market.curves(tokenAddress,at),token.decimals(at),token.totalSupply(at),token.name(at),token.symbol(at),market.graduationAdapter(at)]);
  if (!same(mf,factoryAddress)||!same(mc,collection)||!same(mq,quote)||!same(vr,factoryAddress)||!same(vc,collection)||!same(vq,quote)||launchId===ZeroHash||curve.launchId!==launchId||!same(curve.vault,vaultAddress)||decimals!==18n||supply!==1000000000n*10n**18n) fail();
  const launch=await vault.launches(launchId,at);
  if (!same(launch.token,tokenAddress)||!same(launch.curveRecorder,marketAddress)) fail();
  const [curveLogs,transfers]=await Promise.all([market.queryFilter(market.filters.Traded(tokenAddress),fromBlock,toBlock),token.queryFilter(token.filters.Transfer(),fromBlock,toBlock)]);
  const trades=curveLogs.map(l=>({stage:'curve',side:l.args.buySide?'buy':'sell',payer:l.args.payer,recipient:l.args.recipient,router:null,tokenAmountRaw:String(l.args.tokenAmount),quoteBaseRaw:String(l.args.baseQuote),protocolFeeRaw:String(l.args.totalFee),lpFeeUnits:null,blockNumber:l.blockNumber,blockHash:l.blockHash,transactionHash:l.transactionHash,transactionIndex:l.transactionIndex,logIndex:l.index}));
  let pool=null;
  if (curve.graduated) {
    if (same(adapter,ZeroAddress)) fail();
    const lock=new Contract(adapter,['function poolKey(address) view returns(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks))','function poolManager() view returns(address)','function positions(address) view returns(bytes32 poolId,uint160 sqrtPriceX96,uint128 liquidity,uint256 tokenSeeded,uint256 quoteSeeded,uint256 tokenDust,uint256 quoteDust)'],provider);
    const [key,manager,position]=await Promise.all([lock.poolKey(tokenAddress,at),lock.poolManager(at),lock.positions(tokenAddress,at)]);
    const poolId=keccak256(AbiCoder.defaultAbiCoder().encode(['tuple(address,address,uint24,int24,address)'],[Array.from(key)]));
    if (position.poolId!==poolId||!(same(key.currency0,quote)||same(key.currency1,quote))) fail();
    if (!same(key.hooks,ZeroAddress)&&!same(key.hooks,launch.graduatedRecorder)) fail();
    pool={id:poolId,manager,hook:key.hooks,liquidityLock:adapter,lpFeeUnits:Number(key.fee)};
    const logs=await provider.getLogs({address:manager,topics:[swapInterface.getEvent('Swap').topicHash,poolId],fromBlock,toBlock});
    const quoteIs0=same(key.currency0,quote);
    for (const l of logs) {
      const a=swapInterface.parseLog(l).args, q=quoteIs0?a.amount0:a.amount1, t=quoteIs0?a.amount1:a.amount0;
      if (q===0n||t===0n) continue;
      if ((q<0n)===(t<0n)) fail();
      // PoolManager identifies its callback caller, not necessarily the trader wallet.
      trades.push({stage:'v4',side:q<0n?'buy':'sell',payer:null,recipient:null,router:a.sender,tokenAmountRaw:String(absolute(t)),quoteBaseRaw:String(absolute(q)),protocolFeeRaw:null,lpFeeUnits:Number(a.fee),blockNumber:l.blockNumber,blockHash:l.blockHash,transactionHash:l.transactionHash,transactionIndex:l.transactionIndex,logIndex:l.index});
    }
  }
  // Check every event against the canonical block, including empty transfer-only blocks.
  const allLogs=[...trades,...transfers.map(l=>({blockNumber:l.blockNumber,blockHash:l.blockHash}))];
  const blocks=new Map();
  const numbers=[...new Set(allLogs.map(l=>l.blockNumber))];
  for(let i=0;i<numbers.length;i+=8) {
    const batch=await Promise.all(numbers.slice(i,i+8).map(n=>provider.getBlock(n)));
    for(const b of batch) { if(!b?.hash) throw new AppError(503,'BLOCK_UNAVAILABLE','Event block is unavailable.'); blocks.set(b.number,b); }
  }
  for(const l of allLogs) if(blocks.get(l.blockNumber)?.hash!==l.blockHash) throw new AppError(503,'CHAIN_REORG','Event block is no longer canonical. Reload the market.');
  for(const t of trades) { if(BigInt(t.tokenAmountRaw)<=0n||BigInt(t.quoteBaseRaw)<=0n) fail(); t.timestamp=blocks.get(t.blockNumber).timestamp; t.id=`${t.blockHash}:${t.transactionHash}:${t.logIndex}`; }
  trades.sort(order);
  // A holder census is available only if this window includes the complete constructor mint.
  const mints=transfers.filter(l=>same(l.args.from,ZeroAddress));
  let holders=null, holderStatus='unavailable: window does not include the token mint';
  if (mints.length===1 && mints[0].args.value===supply) {
    const balances=new Map();
    for(const l of [...transfers].sort((a,b)=>order({...a,logIndex:a.index},{...b,logIndex:b.index}))) {
      const {from,to,value}=l.args;
      if(!same(from,ZeroAddress)) balances.set(from,(balances.get(from)||0n)-value);
      if(!same(to,ZeroAddress)) balances.set(to,(balances.get(to)||0n)+value);
    }
    if([...balances.values()].some(n=>n<0n)||[...balances.values()].reduce((a,b)=>a+b,0n)!==supply) fail();
    const entries=[...balances].filter(([,b])=>b>0n).sort((a,b)=>a[1]===b[1]?a[0].localeCompare(b[0]):a[1]>b[1]?-1:1);
    const top=entries.slice(0,50);
    for(let i=0;i<top.length;i+=8) {
      const real=await Promise.all(top.slice(i,i+8).map(([wallet])=>token.balanceOf(wallet,at)));
      real.forEach((b,j)=>{if(b!==top[i+j][1]) fail();});
    }
    holders={count:entries.length,includesProtocolContracts:true,top:top.map(([wallet,balance])=>({wallet,balanceRaw:String(balance),shareBps:String(balance*10000n/supply),role:same(wallet,marketAddress)?'curve':same(wallet,adapter)?'liquidity-lock':pool&&same(wallet,pool.manager)?'pool-manager':same(wallet,factoryAddress)?'factory':'unclassified'}))};
    holderStatus='complete mint-to-snapshot replay; top balances verified onchain';
  }
  // Recheck event block hashes after all balance reads, not only before them.
  for(let i=0;i<numbers.length;i+=8) {
    const canonical=await Promise.all(numbers.slice(i,i+8).map(n=>provider.getBlock(n)));
    if(canonical.some(b=>!b||blocks.get(b.number)?.hash!==b.hash)) throw new AppError(503,'CHAIN_REORG','Market history changed during this read.');
  }
  if ((await provider.getBlock(toBlock))?.hash!==endBlock.hash) throw new AppError(503,'CHAIN_REORG','Market snapshot changed during this read.');
  const transferData=includeTransfers?{transfers:transfers.map(l=>({id:`${l.blockHash}:${l.transactionHash}:${l.index}`,from:l.args.from,to:l.args.to,valueRaw:String(l.args.value),blockNumber:l.blockNumber,blockHash:l.blockHash,transactionHash:l.transactionHash,transactionIndex:l.transactionIndex,logIndex:l.index}))}:{};
  return {...transferData,snapshot:{blockNumber:toBlock,blockHash:endBlock.hash,blockTime:new Date(endBlock.timestamp*1000).toISOString()},token:{address:tokenAddress,name,symbol,decimals:Number(decimals),supplyRaw:String(supply)},launch:{id:launchId,nftId:String(launch.nftId),creator:launch.creator,factory:factoryAddress,market:marketAddress,vault:vaultAddress,graduated:curve.graduated},pool,range:{fromBlock,toBlock,completeHistory:false},priceUnit:'CHOG per token; execution notional excludes protocol hook fees; v4 LP fees are embedded in pool deltas',intervalSeconds,candles:buildCandles(trades,intervalSeconds),trades,holders,holderStatus};
}
