import {AppError} from './validation.mjs';
const unit=10n**18n;
export function initialBuyQuote(budget,{supply,opening,increase,creatorBps,studioBps,platformBps}) {
  budget=BigInt(budget);
  if(budget===0n)return {tokenOutRaw:'0',spentRaw:'0',refundRaw:'0',feeRaw:'0'};
  const cost=x=>{
    const base=opening*x/unit+increase*x*x/(2n*supply*unit);
    const fee=(base*(creatorBps+studioBps+platformBps)+9999n)/10000n;
    return {base,fee,spent:base+fee};
  };
  let low=0n,high=supply;
  while(low<high){const mid=low+(high-low+1n)/2n;if(cost(mid).spent<=budget)low=mid;else high=mid-1n;}
  const result=cost(low);
  if(low===0n||result.base===0n)throw new AppError(422,'INITIAL_BUY_TOO_SMALL','This CHOG amount is too small to buy tokens. Try a larger amount.');
  return {tokenOutRaw:String(low),spentRaw:String(result.spent),refundRaw:String(budget-result.spent),feeRaw:String(result.fee)};
}
export async function verifiedInitialBuy(market,budget,settings,at) {
  const result=initialBuyQuote(budget,settings),tokens=BigInt(result.tokenOutRaw);
  if(tokens===0n)return result;
  // Cross-check rounding against the deployed curve instead of trusting an offchain price.
  const points=tokens<settings.supply?[tokens,tokens+1n]:[tokens];
  const reserves=await Promise.all(points.map(value=>market.reserveAt(value,at)));
  for(let i=0;i<points.length;i++){
    const x=points[i],expected=settings.opening*x/unit+settings.increase*x*x/(2n*settings.supply*unit);
    if(reserves[i]!==expected)throw new AppError(503,'INITIAL_QUOTE_MISMATCH','The launch price could not be verified. Please try again.');
  }
  return result;
}
