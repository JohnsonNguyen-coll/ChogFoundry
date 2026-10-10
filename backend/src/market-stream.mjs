import { AppError } from './validation.mjs';

// Each event is an authoritative replacement snapshot, never an append-only trade patch.
// Reconnect always gets a fresh snapshot; Last-Event-ID does not authorize stale replay.
export async function openMarketStream(req,res,indexer,token,interval,streams) {
  if(streams.closing) throw new AppError(503,'API_STOPPING','The API is stopping. Reconnect later.');
  if(streams.size>=16) throw new AppError(429,'STREAM_LIMIT','The local API supports at most 16 market streams.');
  if((req.headers['last-event-id']||'').length>160) throw new AppError(400,'INVALID_CURSOR','Market cursor is too long.');
  const initial=await indexer.market(token,interval);
  if(res.destroyed) return;
  if(streams.closing) throw new AppError(503,'API_STOPPING','The API is stopping. Reconnect later.');
  if(streams.size>=16) throw new AppError(429,'STREAM_LIMIT','The local API supports at most 16 market streams.');
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.flushHeaders();streams.add(res);
  let closed=false,lastCursor=null,generation=0;
  const cleanup=()=>{
    if(closed) return;closed=true;clearInterval(heartbeat);streams.delete(res);
    indexer.off('update',update);indexer.off('unavailable',unavailable);
  };
  const emit=(event,data,id)=>{
    const text=JSON.stringify(data);
    if(text.length>1000000||res.writableLength>1000000){cleanup();res.end();return;}
    res.write(`${id?'id: '+id+'\n':''}event: ${event}\ndata: ${text}\n\n`);
  };
  const unavailable=error=>{if(closed)return;emit('unavailable',{error:{code:error.code||'INDEX_UNAVAILABLE',message:error.message||'Market synchronization failed.'}});cleanup();res.end();};
  const update=async status=>{
    const current=++generation;
    if(closed) return;
    try {
      const data=indexer.decorate(await indexer.store.market(token,interval));
      if(closed||current!==generation)return;
      if(data.cursor===lastCursor) return;
      lastCursor=data.cursor;emit(status.reorganized?'reset':'snapshot',data,data.cursor);
    } catch(error){unavailable(error);}
  };
  const heartbeat=setInterval(()=>{if(!closed){if(res.writableLength>1000000){cleanup();res.end();}else res.write(': heartbeat\n\n');}},15000);
  heartbeat.unref();
  res.once('close',cleanup);
  indexer.on('update',update);indexer.on('unavailable',unavailable);
  lastCursor=initial.cursor;emit('snapshot',initial,initial.cursor);
}
