import test from 'node:test';
import assert from 'node:assert/strict';
import {quietMarketEnd} from '../src/quiet-market-range.mjs';
import {MarketIndexer} from '../src/market-indexer.mjs';

test('quiet catch-up inspects every bounded range and stops before any market activity',async()=>{
  const ranges=[];
  const provider={getLogs:async filter=>{ranges.push([filter.fromBlock,filter.toBlock]);assert.ok(filter.toBlock-filter.fromBlock<100);return filter.fromBlock===300?[{address:'0xabc',blockNumber:350}]:[];}};
  assert.equal(await quietMarketEnd(provider,['0xABC'],100,1000),299);
  assert.ok(ranges.some(([start,end])=>start===100&&end===199));
  assert.ok(ranges.some(([start,end])=>start===200&&end===299));
  assert.equal(await quietMarketEnd({getLogs:async()=>[]},['0xABC'],100,20000),6499,'One pass is bounded to 6,400 blocks');
  await assert.rejects(quietMarketEnd({getLogs:async()=>[{address:'0xabc',blockNumber:99}]},['0xabc'],100,1000),e=>e.code==='CHAIN_REORG');
  await assert.rejects(quietMarketEnd({getLogs:async()=>{throw Error('offline');}},['0xabc'],100,1000),/offline/);
});

test('background catch-up does not block an existing checkpoint on a long scan',async()=>{
  let scans=0;
  const indexer={wake:()=>{},store:{head:async()=>({end_block:100})},sync:async()=>{scans++;},lastError:null};
  await MarketIndexer.prototype.ensureReadable.call(indexer);assert.equal(scans,0);
  indexer.wake=null;await MarketIndexer.prototype.ensureReadable.call(indexer);assert.equal(scans,1);
  indexer.wake=()=>{};indexer.store.head=async()=>null;
  await MarketIndexer.prototype.ensureReadable.call(indexer);assert.equal(scans,2);
  indexer.store.head=async()=>({end_block:100});indexer.lastError=Error('Unverified chain');
  await assert.rejects(MarketIndexer.prototype.ensureReadable.call(indexer),/Unverified chain/);
});
