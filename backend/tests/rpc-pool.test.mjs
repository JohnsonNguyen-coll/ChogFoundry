import test from 'node:test';
import assert from 'node:assert/strict';
import { RpcPool, retryableRpcError } from '../src/rpc-pool.mjs';

test('RPC failover distinguishes provider availability from actual execution reverts',()=>{
  assert.ok(retryableRpcError({code:-32005,message:'limit exceeded'}));
  assert.ok(retryableRpcError({code:-32603,message:'historical state pruned'}));
  assert.ok(retryableRpcError({code:-32601,message:'method not found'}));
  assert.ok(!retryableRpcError({code:3,message:'execution reverted'}));
  assert.ok(!retryableRpcError({code:-32602,message:'invalid argument'}));
});
test('pooled transport refuses signing and arbitrary RPC methods before networking',async()=>{
  const pool=new RpcPool({privateUrl:''});
  for(const method of ['eth_sendRawTransaction','eth_sendTransaction','eth_sign','personal_sign','debug_traceTransaction'])await assert.rejects(pool.request({jsonrpc:'2.0',id:1,method,params:[]}),e=>e.code==='RPC_METHOD_NOT_ALLOWED');
  assert.throws(()=>new RpcPool({privateUrl:'not-a-url'}),e=>e.code==='INVALID_RPC_CONFIG');
});
