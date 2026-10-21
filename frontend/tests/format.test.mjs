import test from 'node:test';
import assert from 'node:assert/strict';
import {units,decimal,parseAmount,fixedPrice} from '../src/market-format.mjs';
test('amount display rounds to two decimals without floating point or changing transaction amounts',()=>{
  const raw='12375747514557435201249';
  assert.equal(units(raw),'12,375.75');
  assert.equal(units(9999999999999999999n),'10');
  assert.equal(units(1n),'<0.01');
  assert.equal(units(0n),'0');
  assert.equal(units(-1234567890000000000n),'-1.23');
  assert.equal(units(12345n,2),'123.45');
  assert.equal(units(12345n,0),'12,345');
  assert.equal(decimal('999999999999999999999999.999'),'1,000,000,000,000,000,000,000,000');
  assert.equal(decimal('0.0008'),'<0.01');
  assert.equal(decimal('0.015'),'0.02');
  assert.equal(parseAmount('12375.747514557435201249'),raw);
  assert.equal(fixedPrice('0.0008'),800000000000000000000000000000000n);
});
