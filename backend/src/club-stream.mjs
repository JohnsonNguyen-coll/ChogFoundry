import {AppError} from './validation.mjs';
export function openClubStream(req,res,events,key,room,streams){
  if(streams.closing||streams.size>=16)throw new AppError(503,'CLUB_STREAM_BUSY','Live club updates are busy. Retrying automatically.');
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();streams.add(res);
  let closed=false;
  const cleanup=()=>{if(closed)return;closed=true;clearInterval(heartbeat);events.off('change',change);streams.delete(res);};
  const emit=(type,data)=>{
    if(closed)return;
    if(res.destroyed||res.writableLength>1000000){cleanup();res.end();return;}
    try{res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);}catch{cleanup();res.end();}
  };
  const change=event=>{if(event.key===key&&(!event.room||event.room===room))emit('change',{room,...(event.post?{post:event.post}:{})});};
  const heartbeat=setInterval(()=>{if(!closed){try{res.write(': heartbeat\n\n');}catch{cleanup();res.end();}}},15000);heartbeat.unref();
  res.once('close',cleanup);res.once('error',cleanup);events.on('change',change);
  emit('ready',{room});
}
