import { Interface, ZeroAddress } from 'ethers';
import { AppError, address, tokenId } from './validation.mjs';
import { readMarketWindow } from './market-data.mjs';
const factory=new Interface(['function launch(tuple(uint256 nftId,string name,string symbol,uint256 initialQuoteIn,uint256 minTokenOut,uint256 deadline)) returns(address)','event TokenLaunched(bytes32 indexed launchId,uint256 indexed nftId,address indexed token,address creator,uint256 supply,uint256 initialQuoteIn,uint256 initialTokenOut)']);
const erc20=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const curve=new Interface(['event Traded(address indexed token,address indexed payer,address indexed recipient,bool buySide,uint256 tokenAmount,uint256 baseQuote,uint256 totalFee,uint256 sold,uint256 reserve)']);
const vault=new Interface(['event FeesCredited(bytes32 indexed launchId,address indexed studioOwner,address indexed creator,address recorder,uint256 creatorFee,uint256 studioFee,uint256 platformFee)']);
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
export function transactionHash(value){
  if(typeof value!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value))throw new AppError(400,'INVALID_TRANSACTION_HASH','Enter a complete 32-byte transaction hash.');
  return value.toLowerCase();
}
function events(receipt,emitter,iface,name){
  return receipt.logs.filter(l=>same(l.address,emitter)).flatMap(l=>{try{const parsed=iface.parseLog(l);return parsed?.name===name?[{...l,args:parsed.args}]:[];}catch{return [];}});
}
export async function readLaunchReceipt(provider,config,nftId,hash){
  nftId=String(tokenId(nftId));hash=transactionHash(hash);const factoryAddress=address(config.factoryAddress);
  const [receipt,tx]=await Promise.all([provider.getTransactionReceipt(hash),provider.getTransaction(hash)]);
  if(!receipt||!tx)throw new AppError(404,'RECEIPT_UNAVAILABLE','Transaction is pending or unavailable; no launch result is inferred.');
  if(receipt.blockNumber>config.toBlock)throw new AppError(425,'RECEIPT_NOT_FINALIZED','Receipt is not within the finalized snapshot. Retry after finalization.');
  const fail=()=>{throw new AppError(422,'LAUNCH_RECEIPT_MISMATCH','Receipt, calldata or actual launch/funding events do not match the configured factory and studio.');};
  if(!same(receipt.to,factoryAddress)||!same(tx.to,factoryAddress))fail();
  if(receipt.status!==1)throw new AppError(422,'TRANSACTION_REVERTED','Transaction reverted; it did not create a successful launch.');
  const block=await provider.getBlock(receipt.blockNumber);
  if(!block?.hash||block.hash!==receipt.blockHash||tx.blockHash!==receipt.blockHash||tx.blockNumber!==receipt.blockNumber)throw new AppError(503,'CHAIN_REORG','Receipt block is no longer canonical.');
  const chainId=BigInt(await provider.send('eth_chainId',[]));
  if((config.chainId!=null&&chainId!==BigInt(config.chainId))||tx.chainId!==chainId)throw new AppError(503,'CHAIN_MISMATCH','Receipt network mismatch.');
  let call;try{call=factory.parseTransaction({data:tx.data,value:tx.value});}catch{fail();}
  if(call?.name!=='launch'||tx.value!==0n)fail();
  const params=call.args[0],logs=events(receipt,factoryAddress,factory,'TokenLaunched');
  if(logs.length!==1)fail();const launch=logs[0].args;
  if(String(launch.nftId)!==nftId||launch.nftId!==params.nftId||!same(launch.creator,tx.from)||!same(receipt.from,tx.from)||launch.supply!==1000000000n*10n**18n)fail();
  const state=await readMarketWindow(provider,{...config,tokenAddress:launch.token,fromBlock:receipt.blockNumber,toBlock:receipt.blockNumber,intervalSeconds:60});
  if(state.launch.id!==launch.launchId||!same(state.launch.creator,launch.creator)||state.launch.nftId!==nftId||state.token.name!==params.name||state.token.symbol!==params.symbol)fail();
  const tokenTransfers=events(receipt,launch.token,erc20,'Transfer');
  const sum=(list,from,to)=>list.filter(l=>same(l.args.from,from)&&same(l.args.to,to)).reduce((n,l)=>n+l.args.value,0n);
  if(sum(tokenTransfers,ZeroAddress,factoryAddress)!==launch.supply||sum(tokenTransfers,factoryAddress,state.launch.market)!==launch.supply)fail();
  const money=events(receipt,config.quote,erc20,'Transfer'),paid=params.initialQuoteIn>0n;
  const budgetPulled=sum(money,launch.creator,factoryAddress),refund=sum(money,factoryAddress,launch.creator),spent=sum(money,factoryAddress,state.launch.market);
  if(budgetPulled!==params.initialQuoteIn||spent!==launch.initialQuoteIn||spent+refund!==budgetPulled||launch.initialTokenOut<params.minTokenOut)fail();
  const buys=events(receipt,state.launch.market,curve,'Traded').filter(l=>same(l.args.token,launch.token));
  const credits=events(receipt,state.launch.vault,vault,'FeesCredited').filter(l=>l.args.launchId===launch.launchId);
  let fee=null;
  if(paid){
    if(buys.length!==1||credits.length!==1||launch.initialQuoteIn<=0n||launch.initialTokenOut<=0n)fail();
    const buy=buys[0].args,c=credits[0].args,total=c.creatorFee+c.studioFee+c.platformFee;
    if(!buy.buySide||!same(buy.payer,factoryAddress)||!same(buy.recipient,launch.creator)||buy.tokenAmount!==launch.initialTokenOut||buy.baseQuote+buy.totalFee!==spent||buy.totalFee!==total||!same(c.creator,launch.creator)||!same(c.recorder,state.launch.market)||sum(money,state.launch.market,state.launch.vault)!==total||sum(tokenTransfers,state.launch.market,launch.creator)!==launch.initialTokenOut)fail();
    fee={creatorRaw:String(c.creatorFee),studioRaw:String(c.studioFee),platformRaw:String(c.platformFee),totalRaw:String(total),studioOwnerAtAccrual:c.studioOwner,vault:state.launch.vault,evidenceLogIndex:credits[0].index};
  }else if(buys.length||credits.length||launch.initialQuoteIn!==0n||launch.initialTokenOut!==0n||sum(tokenTransfers,state.launch.market,launch.creator)!==0n)fail();
  if((await provider.getBlock(receipt.blockNumber))?.hash!==block.hash)throw new AppError(503,'CHAIN_REORG','Launch receipt changed during verification.');
  return {token:state.token,launch:state.launch,snapshot:state.snapshot,verifiedThroughBlock:config.toBlock,
    receipt:{transactionHash:hash,status:'verified-launch',creator:launch.creator,factory:factoryAddress,nftId,launchId:launch.launchId,tokenAddress:launch.token,supplyRaw:String(launch.supply),factoryEventLogIndex:logs[0].index,
      firstBuy:{requestedBudgetRaw:String(params.initialQuoteIn),actualSpentRaw:String(spent),refundRaw:String(refund),minimumTokenOutRaw:String(params.minTokenOut),actualTokenOutRaw:String(launch.initialTokenOut),fees:fee},
      gasUsedRaw:String(receipt.gasUsed),nativeFeeRaw:receipt.gasPrice==null?null:String(receipt.gasUsed*receipt.gasPrice),executionEnabled:false,
      policy:'Verified direct factory launch only. Results come from canonical calldata and matching receipt events, not a simulated address or current NFT owner. Fee credits are recorded accruals, not a new payment or claim authorization.'}};
}
