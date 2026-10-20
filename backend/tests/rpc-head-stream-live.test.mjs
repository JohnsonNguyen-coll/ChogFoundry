import test from 'node:test';
import assert from 'node:assert/strict';
import { RpcHeadStream } from '../src/rpc-head-stream.mjs';
import { PUBLIC_WS_RPCS } from '../src/rpc-pool.mjs';

async function until(predicate,timeout=18000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error('Live WebSocket condition timed out.');
}

test('actual Monad WebSocket validates chain, receives heads, reconnects and stops', {timeout:45000},async()=>{
  let wakes=0;
  const stream=new RpcHeadStream(process.env.MONAD_WS_URL||'wss://rpc.monad.xyz',143,()=>wakes++);
  try {
    stream.start();await until(()=>stream.lastHead!==null);
    assert.equal(stream.state,'connected');assert.ok(stream.lastHead>0);assert.ok(wakes>=2);
    const firstEvent=stream.lastEventAt;
    stream.socket.close();
    await until(()=>stream.state==='reconnecting');
    await until(()=>stream.state==='connected'&&stream.lastEventAt!==firstEvent);
    assert.equal(stream.error,null);assert.ok(wakes>=4);
  }finally{stream.close();}
  assert.equal(stream.status().state,'closed');assert.equal(stream.socket,null);
});

test('actual Monad connection cannot wake a consumer configured for the wrong chain',{timeout:20000},async()=>{
  let wakes=0;const stream=new RpcHeadStream(process.env.MONAD_WS_URL||'wss://rpc.monad.xyz',31337,()=>wakes++);
  try{stream.start();await until(()=>stream.error==='WS_CHAIN_MISMATCH');assert.equal(wakes,0);assert.notEqual(stream.state,'connected');}
  finally{stream.close();}
});

test('WebSocket disconnect selects the next real public endpoint before the last fallback',{timeout:45000},async()=>{
  const stream=new RpcHeadStream([...PUBLIC_WS_RPCS,'wss://127.0.0.1:1'],143,()=>{});
  try{
    stream.start();await until(()=>stream.lastHead!==null);
    const previous=stream.endpointIndex;stream.socket.close();
    await until(()=>stream.state==='connected'&&stream.endpointIndex!==previous);
    assert.ok(stream.endpointIndex<PUBLIC_WS_RPCS.length);
    assert.equal(stream.url,PUBLIC_WS_RPCS[stream.endpointIndex]);
  }finally{stream.close();}
});
