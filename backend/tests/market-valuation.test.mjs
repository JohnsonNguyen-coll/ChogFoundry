import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUnits} from 'ethers';
import {curveSpotPrice,poolSpotPrice,marketValuation,selectQuoteUsd,quoteUsdReader} from '../src/market-valuation.mjs';
const quote='0x350035555E10d9AfAF1566AaebfCeD5BA6C27777';
const token={decimals:18,supplyRaw:String(parseUnits('1000000000',18)),circulatingSupplyRaw:String(parseUnits('12375',18))};

test('curve valuation uses marginal price and actual total supply, not the last execution or sold inventory',()=>{
  const price=curveSpotPrice(parseUnits('0.0008'),parseUnits('0.0032'),parseUnits('12375.747514557435201249'),parseUnits('625000000'));
  assert.equal(price,'0.00080006336382727453406823039488');
  const value=marketValuation(token,{spotPriceQuote:price,source:'curve-marginal-price'},{status:'available',priceUsd:'0.002'});
  assert.equal(value.marketCapQuote,'800063.36382727453406823039488');
  assert.equal(value.marketCapUsd,'1600.12672765454906813646078976');
  assert.equal(value.status,'available');
  assert.equal(curveSpotPrice(parseUnits('0.0008'),parseUnits('0.0032'),0n,parseUnits('625000000')),'0.0008');
});

test('v4 price handles both token orderings and never uses the original LP seed price',()=>{
  const sqrt=2n*(1n<<96n);
  assert.equal(poolSpotPrice(sqrt,false),'4.0');
  assert.equal(poolSpotPrice(sqrt,true),'0.25');
  assert.throws(()=>poolSpotPrice(0n,false));
});

test('missing current price or USD rate is unavailable instead of a guessed or zero market cap',()=>{
  const pricing={spotPriceQuote:'0.0008',source:'curve-marginal-price'};
  assert.equal(marketValuation(token,null,{status:'available',priceUsd:'0.002'}).marketCapUsd,null);
  const unavailable=marketValuation(token,pricing,{status:'unavailable',priceUsd:null});
  assert.equal(unavailable.marketCapQuote,'800000.0');assert.equal(unavailable.marketCapUsd,null);
});

test('USD source matches Monad and CHOG exactly and chooses the deepest eligible pair',async()=>{
  const pair=(priceUsd,usd,extra={})=>({chainId:'monad',baseToken:{address:quote},priceUsd,liquidity:{usd},...extra});
  const pairs=[pair('0.002',10000),pair('0.003',500),pair('100',1000000,{chainId:'ethereum'}),pair('100',999999,{baseToken:{address:'0xother'}}),pair('NaN',10000000)];
  assert.equal(selectQuoteUsd(pairs,quote).priceUsd,'0.002');
  let now=1000,calls=0,offline=false;
  const read=quoteUsdReader(quote,{now:()=>now,fetchData:async()=>{calls++;if(offline)throw Error('Offline');return Response.json(pairs);}});
  const [a,b]=await Promise.all([read(),read()]);assert.equal(calls,1);assert.equal(a,b);
  assert.equal((await read()).priceUsd,'0.002');assert.equal(calls,1);
  now=62000;offline=true;
  assert.equal((await read()).status,'unavailable');assert.equal(calls,2);
});
