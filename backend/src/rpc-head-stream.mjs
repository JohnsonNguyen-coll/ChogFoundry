// WebSocket notifications only wake the canonical HTTP indexer. They never credit
// balances, commit proposed logs, authorize a wallet, or submit transactions.
export class RpcHeadStream {
  constructor(url,chainId,onHead) {
    this.urls=Array.isArray(url)?url:[url];
    for(const candidate of this.urls){let parsed;try{parsed=new URL(candidate);}catch{throw new Error('Invalid WebSocket RPC configuration.');}
      if(parsed.protocol!=='wss:' && !(parsed.protocol==='ws:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw new Error('Use a secure WebSocket RPC URL.');}
    if(!this.urls.length)throw new Error('A WebSocket RPC endpoint is required.');
    this.endpointIndex=0;this.url=this.urls[0];this.chainId=chainId;this.onHead=onHead;this.socket=null;this.stopped=true;
    this.retry=null;this.watchdog=null;this.heartbeat=null;this.attempt=0;this.sequence=2;
    this.state='disconnected';this.lastHead=null;this.lastHash=null;this.lastEventAt=null;this.error=null;
  }
  status(){return {transport:'websocket',state:this.state,lastHead:this.lastHead,lastEventAt:this.lastEventAt,error:this.error};}
  start(){if(!this.stopped)return;this.stopped=false;this.connect();}
  connect(){
    if(this.stopped)return;
    this.state='connecting';this.subscription=null;this.url=this.urls[this.endpointIndex];
    const socket=new WebSocket(this.url);this.socket=socket;
    const current=()=>!this.stopped&&this.socket===socket;
    const send=(id,method,params)=>socket.send(JSON.stringify({jsonrpc:'2.0',id,method,params}));
    const timeout=()=>{clearTimeout(this.watchdog);this.watchdog=setTimeout(()=>fail('WS_RESPONSE_TIMEOUT'),12000);this.watchdog.unref();};
    const fail=code=>{if(!current())return;this.error=code;this.disconnect(socket);};
    timeout();
    socket.addEventListener('open',()=>{if(current())send(1,'eth_chainId',[]);});
    socket.addEventListener('message',event=>{
      if(!current())return;
      try {
        if(typeof event.data!=='string'||event.data.length>65536)return fail('WS_INVALID_RESPONSE');
        const message=JSON.parse(event.data);
        if(message.id===1){
          if(message.error||BigInt(message.result)!==BigInt(this.chainId))return fail('WS_CHAIN_MISMATCH');
          send(2,'eth_subscribe',['newHeads']);timeout();
        }else if(message.id===2){
          if(message.error||typeof message.result!=='string'||!message.result.length)return fail('WS_SUBSCRIPTION_REJECTED');
          clearTimeout(this.watchdog);this.subscription=message.result;this.state='connected';this.error=null;this.attempt=0;
          this.onHead(); // Reconnect always reads the missing range from the saved checkpoint.
          this.heartbeat=setInterval(()=>{if(!current())return;timeout();send(++this.sequence,'eth_chainId',[]);},20000);this.heartbeat.unref();
        }else if(Number.isSafeInteger(message.id)&&message.id===this.sequence&&message.id>2){
          if(message.error||BigInt(message.result)!==BigInt(this.chainId))return fail('WS_CHAIN_MISMATCH');
          clearTimeout(this.watchdog);
        }else if(message.method==='eth_subscription'&&this.subscription&&message.params?.subscription===this.subscription){
          const head=message.params.result;
          if(!/^0x[0-9a-f]+$/i.test(head?.number)||!/^0x[0-9a-f]{64}$/i.test(head?.hash))return fail('WS_INVALID_HEAD');
          const number=Number(BigInt(head.number));if(!Number.isSafeInteger(number))return fail('WS_INVALID_HEAD');
          if(this.lastHash===head.hash)return;
          this.lastHead=number;this.lastHash=head.hash;this.lastEventAt=new Date().toISOString();this.onHead();
        }
      }catch{fail('WS_INVALID_RESPONSE');}
    });
    socket.addEventListener('error',()=>fail('WS_CONNECTION_FAILED'));
    socket.addEventListener('close',()=>{if(current())this.disconnect(socket);});
  }
  disconnect(socket){
    if(this.socket!==socket)return;
    this.socket=null;clearTimeout(this.watchdog);clearInterval(this.heartbeat);
    try{socket.close();}catch{}
    if(this.stopped)return;
    this.state='reconnecting';
    this.endpointIndex=(this.endpointIndex+1)%this.urls.length;
    const delay=this.endpointIndex?250:Math.min(30000,1000*2**Math.min(this.attempt++,5));
    this.retry=setTimeout(()=>this.connect(),delay);this.retry.unref();
  }
  close(){
    this.stopped=true;clearTimeout(this.retry);clearTimeout(this.watchdog);clearInterval(this.heartbeat);
    const socket=this.socket;this.socket=null;this.state='closed';try{socket?.close();}catch{}
  }
}
