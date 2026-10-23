import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {openClubStream} from '../src/club-stream.mjs';
test('club SSE pushes saved posts only to the correct studio and room and cleans up on disconnect',{timeout:10000},async()=>{
  const events=new EventEmitter(),streams=new Set(),controller=new AbortController();
  const server=http.createServer((req,res)=>openClubStream(req,res,events,'studio-a','lounge',streams));
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
    assert.match(response.headers.get('content-type'),/text\/event-stream/);
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    const next=async()=>{
      for(;;){const at=buffer.indexOf('\n\n');if(at>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);return {type:frame.match(/event: (.+)/)[1],data:JSON.parse(frame.match(/data: (.+)/)[1])};}const part=await reader.read();assert.equal(part.done,false);buffer+=decoder.decode(part.value,{stream:true});}
    };
    assert.equal((await next()).type,'ready');
    events.emit('change',{key:'studio-b',room:'lounge',post:{id:'wrong-studio'}});
    events.emit('change',{key:'studio-a',room:'ideas',post:{id:'wrong-room'}});
    events.emit('change',{key:'studio-a',room:'lounge',post:{id:'saved-post',content:'Hello'}});
    const post=await next();assert.equal(post.type,'change');assert.equal(post.data.post.id,'saved-post');
    events.emit('change',{key:'studio-a'});assert.deepEqual((await next()).data,{room:'lounge'});
  }finally{controller.abort();for(const stream of streams)stream.end();await new Promise(resolve=>server.close(resolve));}
  assert.equal(events.listenerCount('change'),0);assert.equal(streams.size,0);
});
