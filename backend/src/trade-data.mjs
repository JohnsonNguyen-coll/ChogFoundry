import { Contract, ZeroAddress } from 'ethers';
import { AppError, address } from './validation.mjs';
import { readMarketWindow } from './market-data.mjs';

const erc20 = ['function balanceOf(address) view returns(uint256)', 'function allowance(address,address) view returns(uint256)', 'function decimals() view returns(uint8)'];
const curveAbi = [
  'function CREATOR_BPS() view returns(uint256)', 'function STUDIO_BPS() view returns(uint256)', 'function PLATFORM_BPS() view returns(uint256)',
  'function saleSupply() view returns(uint256)', 'function openingPrice() view returns(uint256)', 'function priceIncrease() view returns(uint256)', 'function targetReserve() view returns(uint256)',
  'function curves(address) view returns(bytes32 launchId,address vault,uint256 sold,uint256 reserve,bool graduated)',
  'function getBuyQuote(address,uint256) view returns(tuple(uint256 tokenOut,uint256 baseQuote,uint256 creatorFee,uint256 studioFee,uint256 platformFee,uint256 quoteSpent))',
  'function getSellQuote(address,uint256) view returns(uint256 baseQuote,uint256 creatorFee,uint256 studioFee,uint256 platformFee,uint256 quoteOut)',
];
export function tradeInput(side, amountRaw, wallet) {
  if (!['buy','sell'].includes(side)) throw new AppError(400,'INVALID_TRADE_SIDE','Choose buy or sell.');
  if (typeof amountRaw !== 'string' || !/^[1-9][0-9]*$/.test(amountRaw) || amountRaw.length > 78 || BigInt(amountRaw) >= 2n ** 256n) throw new AppError(400,'INVALID_TRADE_AMOUNT','Amount must be a positive uint256 integer in raw units.');
  return { side, amountRaw, wallet: wallet == null ? null : address(wallet) };
}
export async function readTradeState(provider, config, wallet = null) {
  const marketData = await readMarketWindow(provider, {...config,fromBlock:config.toBlock,toBlock:config.toBlock,intervalSeconds:60});
  const at = {blockTag:config.toBlock};
  const curve = new Contract(marketData.launch.market,curveAbi,provider);
  const vault = new Contract(marketData.launch.vault,['function treasury() view returns(address)','function credits(address) view returns(uint256 creator,uint256 studio,uint256 platform)'],provider);
  const quote = new Contract(config.quote,erc20,provider), token = new Contract(config.tokenAddress,erc20,provider);
  const nft = new Contract(config.collection,['function ownerOf(uint256) view returns(address)'],provider);
  const [creatorBps,studioBps,platformBps,saleSupply,openingPrice,priceIncrease,targetReserve,state,studioOwner,treasury,quoteDecimals] = await Promise.all([
    curve.CREATOR_BPS(at),curve.STUDIO_BPS(at),curve.PLATFORM_BPS(at),curve.saleSupply(at),curve.openingPrice(at),curve.priceIncrease(at),curve.targetReserve(at),curve.curves(config.tokenAddress,at),nft.ownerOf(marketData.launch.nftId,at),vault.treasury(at),quote.decimals(at),
  ]);
  if (creatorBps!==30n || studioBps!==30n || platformBps!==40n || quoteDecimals!==18n) throw new AppError(503,'TRADE_CONFIGURATION_MISMATCH','The curve fee or quote-decimal configuration differs from the approved baseline.');
  let account = null;
  if (wallet) {
    wallet=address(wallet);
    const [quoteBalance,tokenBalance,quoteAllowance,tokenAllowance,credits] = await Promise.all([quote.balanceOf(wallet,at),token.balanceOf(wallet,at),quote.allowance(wallet,marketData.launch.market,at),token.allowance(wallet,marketData.launch.market,at),vault.credits(wallet,at)]);
    account={wallet,quoteBalanceRaw:String(quoteBalance),tokenBalanceRaw:String(tokenBalance),quoteAllowanceRaw:String(quoteAllowance),tokenAllowanceRaw:String(tokenAllowance),spender:marketData.launch.market,
      feeCredits:{creatorRaw:String(credits.creator),studioRaw:String(credits.studio),platformRaw:String(credits.platform),totalRaw:String(credits.creator+credits.studio+credits.platform),scope:'All launches in this fee vault; not only the selected token.'}};
  }
  const canonical=await provider.getBlock(config.toBlock);
  if(canonical?.hash!==marketData.snapshot.blockHash) throw new AppError(503,'CHAIN_REORG','Trade snapshot changed during this read. Refresh before reviewing.');
  return {pool:marketData.pool,token:marketData.token,launch:marketData.launch,snapshot:marketData.snapshot,quoteAsset:config.quote,
    curve:{saleSupplyRaw:String(saleSupply),soldRaw:String(state.sold),reserveRaw:String(state.reserve),openingPriceRaw:String(openingPrice),priceIncreaseRaw:String(priceIncrease),targetReserveRaw:String(targetReserve)},
    fees:{creatorBps:Number(creatorBps),studioBps:Number(studioBps),platformBps:Number(platformBps),totalBps:Number(creatorBps+studioBps+platformBps),lpBps:0,scope:'Pre-graduation curve only',rounding:'Total rounded up; creator/studio rounded down; remainder goes to platform.'},
    beneficiaries:{creator:marketData.launch.creator,studioOwnerAtSnapshot:studioOwner,treasury,policy:'Studio fees follow ownerOf at actual accrual; this snapshot does not lock the beneficiary.'},account};
}
export async function readCurveQuote(provider, config, input) {
  input=tradeInput(input.side,input.amountRaw,input.wallet);
  const state=await readTradeState(provider,config,input.wallet);
  if(state.launch.graduated) throw new AppError(422,'POST_GRADUATION_QUOTE_UNAVAILABLE','This token graduated. A verified v4 quote path is required; curve quotes cannot be used.');
  const market=new Contract(state.launch.market,curveAbi,provider),at={blockTag:config.toBlock};
  let result;
  try { result=input.side==='buy'?await market.getBuyQuote(config.tokenAddress,input.amountRaw,at):await market.getSellQuote(config.tokenAddress,input.amountRaw,at); }
  catch(error){if(error.code==='CALL_EXCEPTION')throw new AppError(422,'INVALID_TRADE_AMOUNT','The market rejected this amount at the recorded block.');throw error;}
  const buy=input.side==='buy',amount=BigInt(input.amountRaw),fees=result.creatorFee+result.studioFee+result.platformFee;
  const spent=buy?result.quoteSpent:amount,output=buy?result.tokenOut:result.quoteOut;
  if(spent<=0n || output<=0n || (buy && spent>amount) || (buy ? spent!==result.baseQuote+fees : output!==result.baseQuote-fees)) throw new AppError(503,'QUOTE_INCONSISTENT','The contract quote is inconsistent.');
  const inputBalance=input.wallet?BigInt(buy?state.account.quoteBalanceRaw:state.account.tokenBalanceRaw):null;
  const allowance=input.wallet?BigInt(buy?state.account.quoteAllowanceRaw:state.account.tokenAllowanceRaw):null;
  if((await provider.getBlock(config.toBlock))?.hash!==state.snapshot.blockHash) throw new AppError(503,'CHAIN_REORG','Quote block is no longer canonical. Refresh.');
  return {...state,quote:{stage:'curve',spender:state.launch.market,side:input.side,requiredInputRaw:String(spent),requestedInputRaw:input.amountRaw,inputAsset:buy?config.quote:config.tokenAddress,outputAsset:buy?config.tokenAddress:config.quote,
    actualInputRaw:String(spent),unusedBudgetRaw:String(buy?amount-spent:0n),outputRaw:String(output),baseQuoteRaw:String(result.baseQuote),creatorFeeRaw:String(result.creatorFee),studioFeeRaw:String(result.studioFee),platformFeeRaw:String(result.platformFee),totalFeeRaw:String(fees),
    balanceSufficient:inputBalance===null?null:inputBalance>=spent,allowanceSufficient:allowance===null?null:allowance>=spent,
    executable:false,reason:'Read-only block quote. No slippage/deadline, signing or transaction simulation is performed.'}};
}

export async function readTradeQuote(provider, config, input) {
  input=tradeInput(input.side,input.amountRaw,input.wallet);
  const state=await readTradeState(provider,config,input.wallet);
  if(!state.launch.graduated)return readCurveQuote(provider,config,input);
  if(!config.v4QuoterAddress)throw new AppError(503,'V4_QUOTER_NOT_CONFIGURED','A verified Foundry v4 quoter is required for graduated quotes.');
  const quoterAddress=address(config.v4QuoterAddress),at={blockTag:config.toBlock},pool=state.pool;
  if(!pool||await provider.getCode(quoterAddress,config.toBlock)==='0x')throw new AppError(503,'V4_QUOTER_MISMATCH','The configured quoter or pool is unavailable.');
  const quoter=new Contract(quoterAddress,[
    'function liquidityLock() view returns(address)','function poolManager() view returns(address)','function market() view returns(address)','function factory() view returns(address)','function quoteAsset() view returns(address)',
    'function quoteExactInput(address,bool,uint256,uint160) returns(tuple(uint256 input,uint256 output,uint256 quoteBase,uint256 creatorFee,uint256 studioFee,uint256 platformFee,uint256 lpFeeUnits))',
  ],provider);
  let bindings;
  try{bindings=await Promise.all([quoter.liquidityLock(at),quoter.poolManager(at),quoter.market(at),quoter.factory(at),quoter.quoteAsset(at)]);}
  catch(error){if(error.code==='CALL_EXCEPTION'||error.code==='BAD_DATA')throw new AppError(503,'V4_QUOTER_MISMATCH','Configured contract does not expose the expected quoter bindings.');throw error;}
  const expected=[pool.liquidityLock,pool.manager,state.launch.market,config.factoryAddress,config.quote];
  if(bindings.some((value,i)=>value.toLowerCase()!==expected[i].toLowerCase()))throw new AppError(503,'V4_QUOTER_MISMATCH','Quoter deployment bindings differ from the token pool.');
  let creatorBps=0n,studioBps=0n,platformBps=0n;
  if(pool.hook!==ZeroAddress){
    const hook=new Contract(pool.hook,['function creatorBps() view returns(uint256)','function studioBps() view returns(uint256)','function platformBps() view returns(uint256)'],provider);
    [creatorBps,studioBps,platformBps]=await Promise.all([hook.creatorBps(at),hook.studioBps(at),hook.platformBps(at)]);
    if(creatorBps+studioBps+platformBps>=10000n)throw new AppError(503,'V4_FEE_MISMATCH','Hook rates are invalid.');
  }
  if(BigInt(input.amountRaw)>2n**127n-1n)throw new AppError(422,'INVALID_TRADE_AMOUNT','The v4 quote input exceeds the signed delta limit.');
  let result;
  try{result=await quoter.quoteExactInput.staticCall(config.tokenAddress,input.side==='buy',input.amountRaw,0,at);}
  catch(error){if(error.code==='CALL_EXCEPTION')throw new AppError(422,'V4_QUOTE_REJECTED','The actual pool/hook rejected this quote. No fallback price is served.');throw error;}
  const buy=input.side==='buy',amount=BigInt(input.amountRaw),fee=result.creatorFee+result.studioFee+result.platformFee;
  if(result.input<=0n||result.input>amount||result.output<=0n||result.lpFeeUnits!==BigInt(pool.lpFeeUnits)||(buy?result.input!==result.quoteBase+fee:result.output!==result.quoteBase-fee))throw new AppError(503,'QUOTE_INCONSISTENT','Simulated pool quote is inconsistent.');
  let allowance=null;
  if(input.wallet){const asset=new Contract(buy?config.quote:config.tokenAddress,erc20,provider);allowance=await asset.allowance(input.wallet,pool.liquidityLock,at);}
  if((await provider.getBlock(config.toBlock))?.hash!==state.snapshot.blockHash)throw new AppError(503,'CHAIN_REORG','Simulated quote snapshot changed.');
  return {...state,fees:{creatorBps:Number(creatorBps),studioBps:Number(studioBps),platformBps:Number(platformBps),totalBps:Number(creatorBps+studioBps+platformBps),lpFeeUnits:Number(result.lpFeeUnits),lpBps:Number(result.lpFeeUnits)/100,scope:'Bound v4 pool only',rounding:'Hook integer rounding; LP fees are embedded in pool deltas and use the pool input asset.'},quote:{side:input.side,stage:'v4',quoter:quoterAddress,spender:pool.liquidityLock,requestedInputRaw:input.amountRaw,requiredInputRaw:input.amountRaw,inputAsset:buy?config.quote:config.tokenAddress,outputAsset:buy?config.tokenAddress:config.quote,actualInputRaw:String(result.input),unusedBudgetRaw:String(amount-result.input),outputRaw:String(result.output),baseQuoteRaw:String(result.quoteBase),creatorFeeRaw:String(result.creatorFee),studioFeeRaw:String(result.studioFee),platformFeeRaw:String(result.platformFee),totalFeeRaw:String(fee),lpFeeAmountRaw:null,
    balanceSufficient:input.wallet?BigInt(buy?state.account.quoteBalanceRaw:state.account.tokenBalanceRaw)>=amount:null,allowanceSufficient:allowance===null?null:allowance>=amount,executable:false,reason:'Actual eth_call swap simulation with rollback. Token settlement, slippage/deadline and signing still require a separate preflight.'}};
}
