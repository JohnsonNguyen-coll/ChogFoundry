import { JsonRpcProvider } from 'ethers';
import { AppError } from './validation.mjs';

// Official Mainnet endpoints: https://docs.monad.xyz/developer-essentials/network-information
export const PUBLIC_HTTP_RPCS=Object.freeze(['https://rpc.monad.xyz','https://rpc1.monad.xyz','https://rpc2.monad.xyz','https://rpc3.monad.xyz','https://rpc-mainnet.monadinfra.com']);
export const PUBLIC_WS_RPCS=Object.freeze(['wss://rpc.monad.xyz','wss://rpc1.monad.xyz','wss://rpc3.monad.xyz','wss://rpc-mainnet.monadinfra.com']);
export const READ_METHODS=new Set(['eth_chainId','eth_blockNumber','eth_call','eth_estimateGas','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getLogs','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getTransactionCount','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
export function retryableRpcError(error){return error && ([-32005,-32016,-32601].includes(error.code)||/rate.?limit|too many requests|quota|capacity|temporar|timeout|timed out|missing trie|historical state|pruned|not supported|method not found|block range|range limit|unknown block|header not found/i.test(error.message||''));}
const redact=value=>typeof value==='string'?value.replace(/(?:https?|wss?):\/\/[^\s"<>]+/gi,'[RPC endpoint]'):Array.isArray(value)?value.map(redact):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)])):value;
function validateUrl(value,protocol){
  if(!value)return null;
  try{const url=new URL(value);if(url.protocol!==protocol||url.username||url.password)throw Error();return url.toString();}catch{throw new AppError(503,'INVALID_RPC_CONFIG','Invalid backend RPC URL. Use a complete HTTPS/WSS endpoint.');}
}
export class RpcPool {
  constructor({publicUrls=PUBLIC_HTTP_RPCS,privateUrl=process.env.ALCHEMY_RPC_URL,timeoutMs=3500}={}){
    if(!publicUrls.length)throw new AppError(503,'INVALID_RPC_CONFIG','At least one public RPC is required.');
    this.publics=publicUrls.map(url=>({url:validateUrl(url,'https:'),until:0,verifiedUntil:0}));
    this.private=privateUrl?{url:validateUrl(privateUrl,'https:'),until:0,verifiedUntil:0}:null;
    this.cursor=0;this.timeoutMs=timeoutMs;this.used=new Set();
  }
  async post(endpoint,payload,signal){
    const response=await fetch(endpoint.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal});
    if(!response.ok)throw Error('RPC_TRANSPORT_UNAVAILABLE');
    return response.json();
  }
  async request(payload){
    const requests=Array.isArray(payload)?payload:[payload];
    if(!requests.length||requests.length>10||requests.some(r=>!r||!READ_METHODS.has(r.method)||!Array.isArray(r.params)))throw new AppError(400,'RPC_METHOD_NOT_ALLOWED','Only supported read-only RPC methods are allowed.');
    const start=this.cursor++%this.publics.length, ordered=[...this.publics.slice(start),...this.publics.slice(0,start),...(this.private?[this.private]:[])];
    for(const endpoint of ordered){
      if(endpoint.until>Date.now())continue;
      try{
        // One total timeout per endpoint (identity + read), so all public failures
        // leave time to reach the private tier within the API's request budget.
        const signal=AbortSignal.timeout(this.timeoutMs);
        if(endpoint.verifiedUntil<Date.now()){
          const identity=await this.post(endpoint,{jsonrpc:'2.0',id:0,method:'eth_chainId',params:[]},signal);
          if(identity.result!=='0x8f')throw Error('RPC_CHAIN_MISMATCH');
          endpoint.verifiedUntil=Date.now()+60000;
        }
        const response=await this.post(endpoint,payload,signal),rows=Array.isArray(response)?response:[response];
        if(rows.length!==requests.length||requests.some(r=>!rows.some(row=>row.id===r.id&&(Object.hasOwn(row,'result')||row.error))))throw Error('RPC_INVALID_RESPONSE');
        if(rows.some(row=>retryableRpcError(row.error))){endpoint.until=Date.now()+30000;continue;}
        this.used.add(endpoint===this.private?'alchemy-private':new URL(endpoint.url).origin);
        return redact(response);
      }catch{endpoint.until=Date.now()+15000;}
    }
    throw new AppError(502,'RPC_POOL_UNAVAILABLE','Public RPC endpoints and the configured private fallback are unavailable.');
  }
  sources(){return [...this.used];}
}
let shared;
export function sharedRpcPool(){return shared??=new RpcPool();}
export class PooledReadProvider extends JsonRpcProvider {
  constructor(pool=sharedRpcPool()) {super(PUBLIC_HTTP_RPCS[0],undefined,{batchMaxCount:1,cacheTimeout:-1});this.pool=pool;}
  async _send(payload){const result=await this.pool.request(payload);return Array.isArray(result)?result:[result];}
}
