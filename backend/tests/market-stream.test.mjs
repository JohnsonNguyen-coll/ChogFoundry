import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {openMarketStream} from '../src/market-stream.mjs';

test('SSE catches a commit during initial decoration and publishes USD changes without a new chain cursor',{timeout:10000},async()=>{
  const indexer=new EventEmitter(),streams=new Set();
  const snapshot=(cursor,usd)=>({cursor,valuation:{marketCapUsd:usd},index:{caughtUp:true,observedHead:100}});
  const initial=snapshot('1:hash','10');let latest=snapshot('2:hash','11');
  indexer.market=async()=>initial;indexer.decorate=async d=>d;indexer.store={market:async()=>latest};indexer.status=()=>({reorganized:false});
  const server=http.createServer((req,res)=>void openMarketStream(req,res,indexer,'token',60,streams));
  const controller=new AbortController();
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    const next=async()=>{
      for(;;){
        const at=buffer.indexOf('\n\n');
        if(at>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);return {type:frame.match(/event: (.+)/)[1],data:JSON.parse(frame.match(/data: (.+)/)[1])};}
        const part=await reader.read();assert.equal(part.done,false);buffer+=decoder.decode(part.value,{stream:true});
      }
    };
    assert.equal((await next()).data.cursor,'1:hash');
    assert.equal((await next()).data.cursor,'2:hash','Commit between initial read and subscription cannot be lost');
    latest=snapshot('2:hash','12');indexer.emit('update',{});
    assert.equal((await next()).data.valuation.marketCapUsd,'12','USD rate changes even when the chain cursor is unchanged');
    latest=snapshot('3:other','9');indexer.emit('update',{reorganized:true});indexer.emit('update',{});
    const reset=await next();assert.equal(reset.type,'reset');assert.equal(reset.data.cursor,'3:other');
  }finally{controller.abort();for(const stream of streams)stream.end();await new Promise(resolve=>server.close(resolve));}
  assert.equal(indexer.listenerCount('update'),0);
});
