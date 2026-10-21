import test from 'node:test';
import assert from 'node:assert/strict';
import {ZeroAddress} from 'ethers';
import {buildIndexedMarket} from '../src/indexed-market.mjs';

test('circulation uses complete balances, excludes unreleased inventory and burns, and includes live pool tokens',()=>{
  const addr=n=>'0x'+n.toString(16).padStart(40,'0');
  const market=addr(1),factory=addr(2),lock=addr(3),manager=addr(4);
  let id=0;const transfer=(from,to,n)=>({id:String(++id),from,to,valueRaw:String(n)});
  const transfers=[transfer(ZeroAddress,market,1000),transfer(market,factory,10),transfer(market,lock,10),transfer(market,manager,80),transfer(market,'0x000000000000000000000000000000000000dead',40)];
  for(let i=0;i<100;i++)transfers.push(transfer(market,addr(1000+i),1));
  const window={token:{supplyRaw:'1000',decimals:18},launch:{market,factory,graduated:true},pool:{liquidityLock:lock,manager},range:{fromBlock:1},transfers,trades:[]};
  const result=buildIndexedMarket([window],{end_block:2,end_hash:'0x1234'},1,60);
  assert.equal(result.token.circulatingSupplyRaw,'180');
  assert.equal(result.holders.top.length,50);
  assert.equal(result.token.supplyRaw,'1000');
});

test('incomplete mint history cannot publish a guessed circulating supply',()=>{
  const window={token:{supplyRaw:'1000'},launch:{},transfers:[],trades:[]};
  assert.throws(()=>buildIndexedMarket([window],{end_block:1,end_hash:'0x1'},1,60),e=>e.code==='HOLDER_HISTORY_INCOMPLETE');
});
