import test from 'node:test';
import assert from 'node:assert/strict';
import {minimumTradeOutput,prepareDirectTrade} from '../src/direct-trade.mjs';

const input={token:'0x8438df1f5b965ba17aD13EF9bd8C4590b051A072',wallet:'0x392331454Dc8FbF8AAE8958299fD0F5e153a1952',side:'buy',amount:'10',slippage:'0.5',signal:new AbortController().signal};

test('direct trade minimum output keeps integer precision and never permits a zero-token trade',()=>{
  const output='1237574514557435201249';
  assert.equal(minimumTradeOutput(output,'0.5'),String(BigInt(output)*9950n/10000n));
  assert.equal(minimumTradeOutput(output,'0'),output);
  for(const value of ['','-1','100','NaN','1.001'])assert.throws(()=>minimumTradeOutput(output,value));
  assert.throws(()=>minimumTradeOutput('1','99.99'));
  assert.throws(()=>minimumTradeOutput('0','0'));
});

test('a single buy gesture prepares approval only when needed, then freshly quotes before preparing the trade',async()=>{
  const paths=[];let approved=false,quotes=0;
  const read=async path=>{
    paths.push(path);
    if(path.includes('/quote?')){quotes++;return {quote:{balanceSufficient:true,allowanceSufficient:approved,outputRaw:quotes===1?'100000000000000000000':'90000000000000000000'}};}
    return {prepared:true};
  };
  const approval=await prepareDirectTrade({...input,read});
  assert.equal(approval.kind,'approval');assert.ok(!paths.some(p=>p.includes('/preflight?')));
  approved=true;
  const trade=await prepareDirectTrade({...input,read,now:()=>1000000});
  assert.equal(trade.kind,'preflight');assert.equal(quotes,2);
  const query=new URL('http://localhost'+trade.path).searchParams;
  assert.equal(query.get('amountRaw'),'10000000000000000000');
  assert.equal(query.get('minOutputRaw'),'89550000000000000000');
  assert.equal(query.get('wallet'),input.wallet);assert.equal(query.get('deadline'),'2200');
});

test('insufficient balance and cancelled preparations never advance to approval or trade simulation',async()=>{
  let calls=0;
  const read=async()=>{calls++;return {quote:{balanceSufficient:false}};};
  await assert.rejects(prepareDirectTrade({...input,read}),/not have enough CHOG/);assert.equal(calls,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(prepareDirectTrade({...input,signal:controller.signal,read:async()=>({quote:{balanceSufficient:true}})}),e=>e.name==='AbortError');
});
