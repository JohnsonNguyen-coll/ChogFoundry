import { EventEmitter } from 'node:events';
import { Contract, getAddress, keccak256 } from 'ethers';
import { MarketStore } from './market-store.mjs';
import { readMarketWindow } from './market-data.mjs';
import { AppError } from './validation.mjs';
import { RpcHeadStream } from './rpc-head-stream.mjs';

const factoryAbi=['function collection() view returns(address)','function quote() view returns(address)','event TokenLaunched(bytes32 indexed launchId,uint256 indexed nftId,address indexed token,address creator,uint256 supply,uint256 initialQuoteIn,uint256 initialTokenOut)'];
export class MarketIndexer extends EventEmitter {
  constructor(provider,config,{databasePath,storeFactory,chunkSize=100,localFork=false,wsUrl=null}={}) {
    super();
    if(!Number.isSafeInteger(config.deploymentBlock)||config.deploymentBlock<1||!Number.isSafeInteger(config.chainId)||config.chainId<1||!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>100) throw new AppError(503,'INVALID_INDEX_CONFIG','Provide an exact verified factory deployment block and chain ID.');
    if(localFork) {
      const url=new URL(provider._getConnection().url);
      if(config.chainId!==31337||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new AppError(503,'INVALID_FORK_SOURCE','Local-fork indexing is restricted to loopback chain 31337.');
    }
    this.localFork=localFork;
    this.config={finality:localFork?'local-fork-latest':'finalized',chainId:config.chainId,factoryAddress:getAddress(config.factoryAddress),deploymentBlock:config.deploymentBlock,collection:getAddress(config.collection),quote:getAddress(config.quote)};
    this.rpcOrigin=provider.pool?'Monad public RPC pool':new URL(provider._getConnection().url).origin;
    this.provider=provider;this.store=storeFactory?storeFactory(this.config):new MarketStore(this.config,databasePath);this.factory=new Contract(this.config.factoryAddress,factoryAbi,provider);
    this.chunkSize=chunkSize;this.pending=null;this.timer=null;this.stopped=false;this.target=null;this.lastError=null;this.cachedHead=null;this.cachedRevision=0;
    this.headStream=wsUrl?new RpcHeadStream(wsUrl,config.chainId,()=>this.wake?.()):null;
  }
  async sync(maxChunks=3) {
    if(this.stopped) throw new AppError(503,'INDEX_STOPPED','The market indexer is stopped.');
    if(this.pending) return this.pending;
    this.pending=this.scan(maxChunks).catch(error=>{
      this.lastError=error instanceof AppError?error:new AppError(502,'INDEX_RPC_FAILED','Unable to synchronize canonical market history. No stale fallback is served.');
      this.emit('unavailable',this.lastError);throw this.lastError;
    }).finally(()=>{this.pending=null;});
    return this.pending;
  }
  async scan(maxChunks) {
    if(!Number.isSafeInteger(maxChunks)||maxChunks<1||maxChunks>10) throw new AppError(400,'INVALID_INDEX_BUDGET','Scan between one and ten chunks per pass.');
    const p=this.provider,c=this.config;
    if(BigInt(await p.send('eth_chainId',[]))!==BigInt(c.chainId)) throw new AppError(503,'CHAIN_MISMATCH','Indexer RPC chain does not match the configured deployment.');
    if(this.localFork) {const metadata=await p.send('anvil_metadata',[]);if(!metadata.forkedNetwork) throw new AppError(503,'INVALID_FORK_SOURCE','Expected a real-state local Anvil fork.');}
    const target=await p.getBlock(this.localFork?'latest':'finalized');
    if(!target?.hash||target.number<c.deploymentBlock) throw new AppError(503,'DEPLOYMENT_NOT_FINALIZED','The factory deployment is not finalized.');
    const [deployment,base,code,priorCode]=await Promise.all([p.getBlock(c.deploymentBlock),p.getBlock(c.deploymentBlock-1),p.getCode(c.factoryAddress,c.deploymentBlock),p.getCode(c.factoryAddress,c.deploymentBlock-1)]);
    if(!deployment?.hash||!base?.hash||code==='0x'||priorCode!=='0x') throw new AppError(503,'DEPLOYMENT_BLOCK_MISMATCH','The configured block is not the factory first-code deployment block.');
    const [collection,quote]=await Promise.all([this.factory.collection({blockTag:target.number}),this.factory.quote({blockTag:target.number})]);
    if(collection.toLowerCase()!==c.collection.toLowerCase()||quote.toLowerCase()!==c.quote.toLowerCase()) throw new AppError(503,'INDEX_IDENTITY_MISMATCH','Factory asset bindings do not match the configured deployment.');
    await this.store.anchor({deploymentHash:deployment.hash,baseHash:base.hash,codeHash:keccak256(code)});
    let head=await this.store.head(),reorganized=false;
    if(head) {
      const canonical=head.end_block<=target.number?await p.getBlock(head.end_block):null;
      if(canonical?.hash!==head.end_hash) {
        let ancestor=c.deploymentBlock-1;
        const checkpoints=await this.store.checkpoints();
        for(const checkpoint of checkpoints) {
          if(checkpoint.end_block>target.number) continue;
          if((await p.getBlock(checkpoint.end_block))?.hash===checkpoint.end_hash) {ancestor=checkpoint.end_block;break;}
        }
        if(ancestor===c.deploymentBlock-1&&checkpoints.length>1000) throw new AppError(503,'INDEX_REORG_DEPTH','Reorg exceeds the current checkpoint audit budget. Index is unavailable.');
        await this.store.rollback(ancestor);head=await this.store.head();reorganized=true;
      }
    }
    // Before the first launch, only factory launch logs can introduce a token.
    // Scan every bounded range, concurrently, then atomically persist its empty prefix.
    const emptyStart=head?head.end_block+1:c.deploymentBlock;
    let emptyPass=false;
    if(this.store.supportsEmptyHistory && emptyStart+this.chunkSize<=target.number && (await this.store.tokens()).length===0) {
      const ranges=Array.from({length:Math.min(64,Math.ceil((target.number-emptyStart+1)/this.chunkSize))},(_,i)=>({start:emptyStart+i*this.chunkSize,end:Math.min(emptyStart+(i+1)*this.chunkSize-1,target.number)}));
      const results=[];
      for(let i=0;i<ranges.length;i+=16) {
        results.push(...await Promise.all(ranges.slice(i,i+16).map(async range=>{
          const [logs,block]=await Promise.all([this.factory.queryFilter(this.factory.filters.TokenLaunched(),range.start,range.end),p.getBlock(range.end)]);
          return {...range,logs,block};
        })));
      }
      const firstLaunch=results.findIndex(range=>range.logs.length>0);
      const empty=firstLaunch<0?results:results.slice(0,firstLaunch);
      if(empty.length) {
        const checkpoints=empty;
        const end=empty.at(-1).end;
        const [block,prior,endCode,canonicalTarget]=await Promise.all([p.getBlock(end),p.getBlock(head?.end_block??c.deploymentBlock-1),p.getCode(c.factoryAddress,end),p.getBlock(target.number)]);
        if(!block?.hash||prior?.hash!==(head?.end_hash||base.hash)||canonicalTarget?.hash!==target.hash||endCode!==code) throw new AppError(503,'CHAIN_REORG','Empty history changed while scanning. No checkpoint was committed.');
        if(checkpoints.at(-1).block?.hash!==block.hash)throw new AppError(503,'CHAIN_REORG','Checkpoint changed during empty history scan.');
        await this.store.commit(emptyStart,end,block,[],{emptyHistory:true,checkpoints});
        head=await this.store.head();
        emptyPass=firstLaunch<0;
      }
    }
    for(let i=0;!emptyPass&&i<maxChunks;i++) {
      const start=head?head.end_block+1:c.deploymentBlock;
      if(start>target.number) break;
      const end=Math.min(start+this.chunkSize-1,target.number),endBlock=await p.getBlock(end);
      if(!endBlock?.hash||await p.getCode(c.factoryAddress,end)!==code) throw new AppError(503,'INDEX_CONTRACT_CHANGED','Factory code or checkpoint block changed.');
      const launches=await this.factory.queryFilter(this.factory.filters.TokenLaunched(),start,end);
      const tokens=[...new Set([...(await this.store.tokens()),...launches.map(l=>l.args.token.toLowerCase())])];
      if(tokens.length>200) throw new AppError(503,'INDEX_TOKEN_LIMIT','The local single-worker index exceeds its 200-token budget.');
      const windows=[];
      for(const tokenAddress of tokens) windows.push(await readMarketWindow(p,{...c,tokenAddress,fromBlock:start,toBlock:end,includeTransfers:true}));
      const prior=head?await p.getBlock(head.end_block):await p.getBlock(c.deploymentBlock-1);
      if(prior?.hash!==(head?.end_hash||base.hash)||(await p.getBlock(end))?.hash!==endBlock.hash||(await p.getBlock(target.number))?.hash!==target.hash) throw new AppError(503,'CHAIN_REORG','Chain changed while indexing. No chunk was committed.');
      await this.store.commit(start,end,endBlock,windows);head=await this.store.head();
    }
    this.cachedHead=await this.store.head();this.cachedRevision=await this.store.revision();
    this.target=target;this.lastError=null;
    const status=this.status();
    this.emit('update',{...status,reorganized});return status;
  }
  status() {
    const head=this.cachedHead;
    return {configured:true,deploymentBlock:this.config.deploymentBlock,indexedThrough:head?.end_block??null,indexedHash:head?.end_hash??null,observedHead:this.target?.number??null,finality:this.config.finality,caughtUp:!this.lastError&&!!head&&head.end_block===this.target?.number,revision:this.cachedRevision,error:this.lastError?.code??null,realtime:this.headStream?.status()??{transport:'http-polling'}};
  }
  async market(token,interval=60,wallet=null) {
    await this.sync();
    const data=await this.store.market(getAddress(token),interval,wallet),head=await this.store.head();
    if((await this.provider.getBlock(head.end_block))?.hash!==head.end_hash) throw new AppError(503,'CHAIN_REORG','Indexed snapshot is no longer canonical. Resynchronize.');
    return this.decorate(data);
  }
  async walletHistory(token,wallet){
    const data=await this.market(token,60,getAddress(wallet));
    const {token:asset,launch,snapshot,range,walletActivity,index,provenance,cursor}=data;
    return {token:asset,launch,snapshot,range,walletActivity,index,provenance,cursor};
  }
  async portfolio(wallet){
    await this.sync();
    const data=await this.store.portfolio(getAddress(wallet));
    if((await this.provider.getBlock(data.snapshot.blockNumber))?.hash!==data.snapshot.blockHash)throw new AppError(503,'CHAIN_REORG','Portfolio checkpoint is no longer canonical.');
    return this.decorate(data);
  }
  decorate(data) {
    const status={...this.status(),indexedThrough:data.snapshot.blockNumber,indexedHash:data.snapshot.blockHash,revision:Number(data.cursor.split(':')[0]),caughtUp:!this.lastError&&data.snapshot.blockNumber===this.target?.number};
    return {...data,index:status,provenance:{chainId:this.config.chainId,blockNumber:data.snapshot.blockNumber,blockHash:data.snapshot.blockHash,blockTime:data.snapshot.blockTime,fetchedAt:new Date().toISOString(),rpcOrigin:this.rpcOrigin,...(this.provider.pool?{rpcSources:this.provider.pool.sources()}:{}),source:this.store.source||'Canonical RPC event index in local SQLite',finality:this.config.finality}};
  }
  start() {
    if(this.wake||this.stopped) return;
    let running=false,lastStarted=0;
    const tick=async()=>{
      if(this.stopped||running)return;running=true;lastStarted=Date.now();
      try{await this.sync();}catch{}
      finally{running=false;if(!this.stopped){const delay=!this.lastError&&this.target&&!this.status().caughtUp?50:this.headStream?.state==='connected'?15000:3000;this.timer=setTimeout(tick,delay);this.timer.unref();}}
    };
    this.wake=()=>{
      if(this.stopped||running)return;
      clearTimeout(this.timer);this.timer=setTimeout(tick,Math.max(0,1000-(Date.now()-lastStarted)));this.timer.unref();
    };
    this.headStream?.start();
    this.timer=setTimeout(tick,0);this.timer.unref();
  }
  async close() {
    this.stopped=true;clearTimeout(this.timer);
    this.headStream?.close();
    if(this.pending) await this.pending.catch(()=>{});
    await this.store.close();this.removeAllListeners();
  }
}
