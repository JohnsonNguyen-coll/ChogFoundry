import {formatUnits,parseUnits} from 'ethers';
const SCALE=10n**36n;

export function curveSpotPrice(opening,increase,sold,saleSupply){
  if(saleSupply<=0n||sold<0n||sold>saleSupply)throw Error('INVALID_CURVE_PRICE');
  return formatUnits(opening*10n**18n+increase*sold*10n**18n/saleSupply,36);
}
export function poolSpotPrice(sqrtPriceX96,quoteIs0){
  if(sqrtPriceX96<=0n)throw Error('UNINITIALIZED_POOL');
  const square=sqrtPriceX96*sqrtPriceX96,q192=1n<<192n;
  return formatUnits(quoteIs0?q192*SCALE/square:square*SCALE/q192,36);
}
export function marketValuation(token,pricing,usdRate){
  const base={currency:'USD',method:'current-price-times-total-supply',priceSource:pricing?.source??null,quoteUsd:usdRate};
  if(!pricing?.spotPriceQuote||!token?.supplyRaw)return {...base,status:'price-unavailable',marketCapQuote:null,marketCapUsd:null};
  const cap=parseUnits(pricing.spotPriceQuote,36)*BigInt(token.supplyRaw)/10n**BigInt(token.decimals);
  const dollar=usdRate?.status==='available'?parseUnits(usdRate.priceUsd,36):null;
  return {...base,status:dollar===null?'usd-unavailable':'available',tokenPriceQuote:pricing.spotPriceQuote,marketCapQuote:formatUnits(cap,36),marketCapUsd:dollar===null?null:formatUnits(cap*dollar/SCALE,36)};
}

export function selectQuoteUsd(pairs,quote){
  if(!Array.isArray(pairs))return null;
  return pairs.filter(p=>p.chainId==='monad'&&p.baseToken?.address?.toLowerCase()===quote.toLowerCase()&&/^\d+(?:\.\d{1,36})?$/.test(p.priceUsd||'')&&parseUnits(p.priceUsd,36)>0n&&Number.isFinite(p.liquidity?.usd)&&p.liquidity.usd>0)
    .sort((a,b)=>b.liquidity.usd-a.liquidity.usd)[0]??null;
}
export function quoteUsdReader(quote,{chainId=143,fetchData=fetch,now=Date.now}={}){
  let cached,pending,retryAfter=0;
  return async()=>{
    if(chainId!==143)return {status:'unavailable',priceUsd:null};
    if(cached&&now()<cached.expiresAt)return cached;
    if(now()<retryAfter)return {status:'unavailable',priceUsd:null,source:'DEX Screener'};
    if(pending)return pending;
    pending=(async()=>{
      try{
        const response=await fetchData(`https://api.dexscreener.com/tokens/v1/monad/${quote}`,{signal:AbortSignal.timeout(5000),redirect:'error'});
        if(!response.ok)throw Error('QUOTE_USD_UNAVAILABLE');
        const text=await response.text();if(text.length>1000000)throw Error('QUOTE_RESPONSE_TOO_LARGE');
        const selected=selectQuoteUsd(JSON.parse(text),quote);if(!selected)throw Error('NO_QUOTE_PAIR');
        cached={status:'available',priceUsd:selected.priceUsd,source:'DEX Screener',pairAddress:selected.pairAddress,fetchedAt:new Date(now()).toISOString(),expiresAt:now()+60000};
        return cached;
      }catch{return {status:'unavailable',priceUsd:null,source:'DEX Screener'};}
      finally{retryAfter=now()+10000;pending=null;}
    })();return pending;
  };
}
