import test from 'node:test';
import assert from 'node:assert/strict';
import {initialBuyQuote} from '../src/initial-buy.mjs';
const unit=10n**18n,settings={supply:625000000n*unit,opening:800000000000000n,increase:3200000000000000n,creatorBps:30n,studioBps:30n,platformBps:40n};
const cost=x=>{const base=settings.opening*x/unit+settings.increase*x*x/(2n*settings.supply*unit);return base+(base*100n+9999n)/10000n;};
test('initial buy includes rounded fees, maximizes output and never exceeds CHOG budget',()=>{
  for(const budget of [2n,10n**12n,2n*unit,100n*unit,1515000n*unit,2000000n*unit]){
    const quote=initialBuyQuote(budget,settings),tokens=BigInt(quote.tokenOutRaw),spent=BigInt(quote.spentRaw);
    assert.ok(tokens>0n&&tokens<=settings.supply);
    assert.equal(spent,cost(tokens));assert.ok(spent<=budget);
    assert.equal(spent+BigInt(quote.refundRaw),budget);
    if(tokens<settings.supply)assert.ok(cost(tokens+1n)>budget);
  }
  assert.equal(initialBuyQuote(2000000n*unit,settings).tokenOutRaw,String(settings.supply));
  assert.equal(initialBuyQuote(0n,settings).tokenOutRaw,'0');
  assert.throws(()=>initialBuyQuote(1n,settings),e=>e.code==='INITIAL_BUY_TOO_SMALL');
});
