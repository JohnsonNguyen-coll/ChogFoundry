import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PostgresMarketStore} from '../src/postgres-market-store.mjs';
import {MarketStore} from '../src/market-store.mjs';
const token='0x1111111111111111111111111111111111111111',alice='0x2222222222222222222222222222222222222222',bob='0x3333333333333333333333333333333333333333';
const config={chainId:143,factoryAddress:token,finality:'test',deploymentBlock:100};
const zero='0x0000000000000000000000000000000000000000';
function window(block){return {token:{address:token,supplyRaw:'100',decimals:18},launch:{market:'0x4444444444444444444444444444444444444444',factory:token,graduated:block===6100},pool:null,snapshot:{blockNumber:block,blockHash:'quiet',blockTime:1},range:{fromBlock:block,toBlock:block},trades:[],transfers:[]};}
const first=window(100);first.transfers=[{id:'mint',from:zero,to:alice,valueRaw:'100'}];
const active=window(2500);active.transfers=[{id:'transfer',from:alice,to:bob,valueRaw:'25'}];active.trades=[{id:'trade',stage:'curve',side:'buy',payer:bob,recipient:bob,timestamp:60,blockNumber:2500,transactionIndex:0,logIndex:0,quoteBaseRaw:'10',tokenAmountRaw:'25'}];
async function check(store){
  const market=await store.market(token,60,bob);
  assert.equal(market.tradeCount,1);assert.equal(market.candles.length,1);
  assert.equal(market.holders.count,2);assert.equal(market.walletActivity.balanceRaw,'25');
  assert.equal(market.launch.graduated,true);assert.equal(market.snapshot.blockNumber,6100);
  assert.equal(market.range.fromBlock,100);assert.equal(market.range.completeHistory,true);
  const portfolio=await store.portfolio(bob);
  assert.equal(portfolio.positions[0].activity.balanceRaw,'25');
  assert.equal(portfolio.capacity.scannedWindows,3);
}
test('PostgreSQL replays all events beyond 6000 quiet windows without hitting market or portfolio budget',async()=>{
  const db=new PGlite();
  try{
    await db.exec(await readFile(new URL('../supabase/migrations/001_foundry.sql',import.meta.url),'utf8'));
    const store=new PostgresMarketStore(config,db);await store.initialize();
    await db.query("INSERT INTO foundry.market_chunks(index_key,end_block,start_block,end_hash,block_time) SELECT $1,n,n,'quiet',now() FROM generate_series(100,6100) n",[store.key]);
    await db.query('INSERT INTO foundry.market_windows(index_key,token,end_block,data_json) SELECT $1,$2,n,$3::jsonb FROM generate_series(100,6099) n',[store.key,token,JSON.stringify(window(101))]);
    await db.query('INSERT INTO foundry.market_windows VALUES($1,$2,6100,$3)',[store.key,token,JSON.stringify(window(6100))]);
    for(const data of [first,active])await db.query('UPDATE foundry.market_windows SET data_json=$3 WHERE index_key=$1 AND token=$2 AND end_block=$4',[store.key,token,JSON.stringify(data),data.range.toBlock]);
    await check(store);
    await store.rollback(2500);
    const rolled=await store.market(token);assert.equal(rolled.launch.graduated,false);assert.equal(rolled.tradeCount,1);assert.equal(rolled.snapshot.blockNumber,2500);
  }finally{await db.close();}
});
test('SQLite applies the same event-preserving window selection',async()=>{
  const store=new MarketStore(config,':memory:');
  try{
    store.transaction(()=>{
      const chunk=store.db.prepare('INSERT INTO market_chunks VALUES(?,?,?,?)');
      const insert=store.db.prepare('INSERT INTO market_windows VALUES(?,?,?)');
      for(let n=100;n<=6100;n++){
        chunk.run(n,n,'quiet','1970-01-01T00:00:01Z');
        insert.run(token,n,JSON.stringify(n===100?first:n===2500?active:window(n)));
      }
    });
    await check(store);
  }finally{store.close();}
});
