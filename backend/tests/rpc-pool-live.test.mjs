import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_HTTP_RPCS, RpcPool } from '../src/rpc-pool.mjs';

test('real public Monad pool rotates among official endpoints before private fallback',{timeout:60000},async()=>{
  const pool=new RpcPool({privateUrl:'https://127.0.0.1:1'});
  for(let id=1;id<=PUBLIC_HTTP_RPCS.length;id++){
    const result=await pool.request({jsonrpc:'2.0',id,method:'eth_chainId',params:[]});
    assert.equal(result.result,'0x8f');
  }
  assert.ok(pool.sources().length>=2);assert.ok(!pool.sources().includes('alchemy-private'));
});
test('real transport failures exhaust public tier before using last fallback',{timeout:20000},async()=>{
  // The final slot uses a real public Monad endpoint to test tier ordering without
  // requiring private credentials. No successful RPC response is fabricated.
  const pool=new RpcPool({publicUrls:['https://127.0.0.1:1'],privateUrl:PUBLIC_HTTP_RPCS[0],timeoutMs:4000});
  const result=await pool.request({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]});
  assert.equal(result.result,'0x8f');assert.deepEqual(pool.sources(),['alchemy-private']);
});
