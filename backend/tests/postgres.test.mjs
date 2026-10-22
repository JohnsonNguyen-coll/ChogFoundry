import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PostgresStudioStore } from '../src/postgres-studio-store.mjs';
import { PostgresDatabase,postgresOptions } from '../src/postgres.mjs';
import { createApi } from '../src/server.mjs';
import { PostgresMarketStore } from '../src/postgres-market-store.mjs';

test('quiet market checkpoints preserve all tokens, reject hidden events and roll back atomically',async()=>{
  const engine=new PGlite();
  try{
    await engine.exec(await readFile(new URL('../supabase/migrations/001_foundry.sql',import.meta.url),'utf8'));
    const store=new PostgresMarketStore({chainId:143,factoryAddress:'storage-only-quiet',finality:'storage-only',deploymentBlock:100},engine);
    const block={number:100,hash:'initial',timestamp:1};
    await store.commit(100,100,block,[{token:{address:'storage-only-token'},launch:{graduated:false},pool:null}]);
    const end={number:6500,hash:'quiet-end',timestamp:2};
    const window={token:{address:'storage-only-token'},launch:{graduated:true},pool:{manager:'storage-manager'},snapshot:{blockHash:end.hash},range:{fromBlock:101,toBlock:6500},trades:[],transfers:[]};
    const checkpoints=Array.from({length:64},(_,i)=>({start:101+i*100,end:200+i*100,block:{...end,number:200+i*100}}));
    await assert.rejects(store.commit(101,6500,end,[{...window,trades:[{}]}],{quietHistory:true}),e=>e.code==='INDEX_GAP');
    await assert.rejects(store.commit(101,6500,end,[{...window,token:{address:'unknown-token'}}],{quietHistory:true,checkpoints}),e=>e.code==='INDEX_GAP');
    assert.equal((await store.head()).end_block,100);
    await store.commit(101,6500,end,[window],{quietHistory:true,checkpoints});
    assert.equal((await store.head()).end_block,6500);
    assert.equal((await store.assets())[0].launch.graduated,true,'Directory uses the latest stage and pool bindings');
    await store.rollback(100);
    assert.equal((await store.assets())[0].launch.graduated,false);
  }finally{await engine.close();}
});

test('empty history checkpoints remain bounded, contiguous, atomic and reversible in PostgreSQL',async()=>{
  const engine=new PGlite();
  try {
    await engine.exec(await readFile(new URL('../supabase/migrations/001_foundry.sql',import.meta.url),'utf8'));
    const store=new PostgresMarketStore({chainId:143,factoryAddress:'storage-only',finality:'storage-only',deploymentBlock:100},engine);
    const block={number:6499,hash:'storage-only-checkpoint',timestamp:1};
    const checkpoints=Array.from({length:64},(_,i)=>({start:100+i*100,end:199+i*100,block:{...block,number:199+i*100}}));
    await store.commit(100,6499,block,[],{emptyHistory:true,checkpoints});
    assert.equal((await store.head()).end_block,6499);
    assert.deepEqual(await store.tokens(),[]);
    await assert.rejects(store.commit(100,6499,block,[],{emptyHistory:true,checkpoints}),e=>e.code==='INDEX_GAP');
    await assert.rejects(store.commit(6500,12900,{...block,number:12900},[],{emptyHistory:true}),e=>e.code==='INDEX_GAP');
    await assert.rejects(store.commit(6500,6600,{...block,number:6600},[]),e=>e.code==='INDEX_GAP');
    await store.commit(6500,6500,{...block,number:6500},[{token:{address:'storage-only-token'}}]);
    const revision=await store.revision();
    await assert.rejects(store.commit(6501,6600,{...block,number:6600},[],{emptyHistory:true,checkpoints:[{start:6501,end:6600,block:{...block,number:6600}}]}),e=>e.code==='INDEX_GAP');
    assert.equal((await store.head()).end_block,6500);assert.equal(await store.revision(),revision);
    await store.rollback(99);assert.equal(await store.head(),null);assert.deepEqual(await store.tokens(),[]);
    await store.commit(100,6499,block,[],{emptyHistory:true,checkpoints});
    assert.equal((await store.head()).end_block,6499);
  } finally {await engine.close();}
});

test('PostgreSQL engine executes migration and preserves revision atomicity; not a Supabase connection',async()=>{
  const engine=new PGlite();
  try {
    await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
    const sql=await readFile(new URL('../supabase/migrations/001_foundry.sql',import.meta.url),'utf8');
    await engine.exec(sql);await engine.exec(sql);
    const store=new PostgresStudioStore(engine);
    // Storage-only input: no wallet/NFT authority or production profile is fabricated.
    const input={name:'Storage validation',description:'',website:'',coverUrl:'',expectedRevision:0};
    await store.save('storage-only','115792089237316195423570985008687907853269984665640564039457584007913129639935',input,'original author',null);
    const results=await Promise.allSettled([store.save('storage-only','0',{...input,expectedRevision:1,name:'Revision A'},'author A',null),store.save('storage-only','0',{...input,expectedRevision:1,name:'Revision B'},'author B',null)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected')[0].reason.code,'REVISION_CONFLICT');
    assert.equal((await store.get('storage-only')).createdBy,'original author');
    assert.equal((await store.get('storage-only')).revision,2);
    assert.equal((await store.history('storage-only')).length,2);
    assert.equal((await store.list()).length,1);
    // Same token ID in different collection namespaces must not leak across directories.
    await store.save('143:collection-a:1557','1557',input,'storage author',null);
    await store.save('143:collection-b:1557','1557',input,'storage author',null);
    assert.deepEqual((await store.list('143:collection-a:')).map(p=>p.key),['143:collection-a:1557']);
    assert.deepEqual(await store.list('143:missing:'),[]);
    await engine.exec('SET ROLE anon');
    try{await assert.rejects(engine.query('SELECT * FROM foundry.studio_profiles'));}finally{await engine.exec('RESET ROLE');}
    await engine.exec('SET ROLE authenticated');
    try{await assert.rejects(engine.query('SELECT * FROM foundry.market_indexes'));}finally{await engine.exec('RESET ROLE');}
  }finally{await engine.close();}
});

test('PostgreSQL configuration enforces TLS verification and hides connection errors',async()=>{
  assert.equal(postgresOptions(''),null);
  assert.throws(()=>postgresOptions('invalid'),e=>e.code==='INVALID_DATABASE_CONFIG');
  const parsed=postgresOptions('postgresql://configuration:validation@db.example.com/postgres?sslmode=disable');
  assert.equal(parsed.ssl.rejectUnauthorized,true);
  assert.equal(new URL(parsed.connectionString).searchParams.has('sslmode'),false);
  const db=new PostgresDatabase({url:''});
  try{await assert.rejects(db.query('SELECT 1'),e=>e.code==='SUPABASE_NOT_CONFIGURED');}finally{await db.close();}
});

test('default API uses Supabase primary and never falls back to local profiles',async()=>{
  const previous=process.env.SUPABASE_DATABASE_URL;delete process.env.SUPABASE_DATABASE_URL;
  const {server}=createApi();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${server.address().port}`;
    const health=await(await fetch(base+'/api/health')).json();assert.deepEqual(health.storage,{provider:'supabase-postgres',configured:false});
    const response=await fetch(base+'/api/studios');assert.equal(response.status,503);assert.equal((await response.json()).error.code,'SUPABASE_NOT_CONFIGURED');
  }finally{await new Promise(resolve=>server.close(resolve));if(previous===undefined)delete process.env.SUPABASE_DATABASE_URL;else process.env.SUPABASE_DATABASE_URL=previous;}
});
