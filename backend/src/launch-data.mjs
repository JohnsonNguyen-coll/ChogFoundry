import { Contract, Interface, toQuantity } from 'ethers';
import { AppError, address, tokenId } from './validation.mjs';
import { actionWallet, actionTransaction, simulateAction } from './fee-actions.mjs';
const factoryAbi=['function collection() view returns(address)','function quote() view returns(address)','function market() view returns(address)','function feeVault() view returns(address)','function TOKEN_SUPPLY() view returns(uint256)','function launch(tuple(uint256 nftId,string name,string symbol,uint256 initialQuoteIn,uint256 minTokenOut,uint256 deadline)) returns(address)'];
const iface=new Interface(factoryAbi),same=(a,b)=>a.toLowerCase()===b.toLowerCase();
export function launchInput(input){
  const nftId=String(tokenId(input.nftId)),wallet=actionWallet(input.wallet);
  for(const [key,max] of [['name',64],['symbol',12]]){
    const value=input[key];
    if(typeof value!=='string'||value!==value.trim()||Buffer.byteLength(value,'utf8')<1||Buffer.byteLength(value,'utf8')>max||/[\u0000-\u001f\u007f]/.test(value))throw new AppError(400,'INVALID_METADATA',`Enter ${key} within ${max} UTF-8 bytes, without control characters or edge whitespace.`);
  }
  const budget=tokenId(input.initialQuoteIn),minimum=tokenId(input.minTokenOut);
  if((budget===0n)!==(minimum===0n))throw new AppError(400,'INVALID_INITIAL_BUY','Zero first-buy budget requires zero minimum; a paid buy requires positive minimum output.');
  if(typeof input.deadline!=='string'||!/^[1-9][0-9]{0,9}$/.test(input.deadline))throw new AppError(400,'INVALID_DEADLINE','Provide an explicit Unix deadline in seconds.');
  return {nftId,wallet,name:input.name,symbol:input.symbol,initialQuoteIn:String(budget),minTokenOut:String(minimum),deadline:input.deadline};
}
export async function readLaunchPreflight(provider,config,input){
  input=launchInput(input);const at={blockTag:config.toBlock},factoryAddress=address(config.factoryAddress);
  const mismatch=()=>{throw new AppError(503,'LAUNCH_BINDING_MISMATCH','Factory/market/vault assets or baseline configuration do not match.');};
  if(await provider.getCode(factoryAddress,config.toBlock)==='0x')mismatch();
  const factory=new Contract(factoryAddress,factoryAbi,provider);
  const [collection,quoteAsset,marketAddress,vaultAddress,supply,block]=await Promise.all([factory.collection(at),factory.quote(at),factory.market(at),factory.feeVault(at),factory.TOKEN_SUPPLY(at),provider.getBlock(config.toBlock)]);
  if(!block?.hash)throw new AppError(503,'BLOCK_UNAVAILABLE','Launch snapshot unavailable.');
  if(!same(collection,config.collection)||!same(quoteAsset,config.quote)||supply!==1000000000n*10n**18n)mismatch();
  const market=new Contract(marketAddress,['function factory() view returns(address)','function collection() view returns(address)','function quote() view returns(address)','function saleSupply() view returns(uint256)','function openingPrice() view returns(uint256)','function priceIncrease() view returns(uint256)','function targetReserve() view returns(uint256)','function CREATOR_BPS() view returns(uint256)','function STUDIO_BPS() view returns(uint256)','function PLATFORM_BPS() view returns(uint256)'],provider);
  const vault=new Contract(vaultAddress,['function registrar() view returns(address)','function collection() view returns(address)','function quote() view returns(address)'],provider);
  const nft=new Contract(collection,['function ownerOf(uint256) view returns(address)'],provider);
  const quote=new Contract(quoteAsset,['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'],provider);
  const [mf,mc,mq,vr,vc,vq,sales,opening,increase,target,c,s,p,owner,decimals,balance,allowance]=await Promise.all([market.factory(at),market.collection(at),market.quote(at),vault.registrar(at),vault.collection(at),vault.quote(at),market.saleSupply(at),market.openingPrice(at),market.priceIncrease(at),market.targetReserve(at),market.CREATOR_BPS(at),market.STUDIO_BPS(at),market.PLATFORM_BPS(at),nft.ownerOf(input.nftId,at),quote.decimals(at),quote.balanceOf(input.wallet,at),quote.allowance(input.wallet,factoryAddress,at)]);
  if(!same(mf,factoryAddress)||!same(mc,collection)||!same(mq,quoteAsset)||!same(vr,factoryAddress)||!same(vc,collection)||!same(vq,quoteAsset)||decimals!==18n||c!==30n||s!==30n||p!==40n||sales<=0n||sales>supply)mismatch();
  const now=Math.max(block.timestamp,Math.floor(Date.now()/1000));
  if(Number(input.deadline)<=now||Number(input.deadline)>now+3600)throw new AppError(400,'INVALID_DEADLINE','Choose a future launch deadline within one hour.');
  const chainId=String(BigInt(await provider.send('eth_chainId',[])));
  if(config.chainId!=null&&BigInt(chainId)!==BigInt(config.chainId))throw new AppError(503,'CHAIN_MISMATCH','Launch inspection network mismatch.');
  const params={nftId:input.nftId,name:input.name,symbol:input.symbol,initialQuoteIn:input.initialQuoteIn,minTokenOut:input.minTokenOut,deadline:input.deadline};
  const transaction={chainId,from:input.wallet,to:factoryAddress,value:'0x0',data:iface.encodeFunctionData('launch',[params])},blockers=[];
  if(!same(owner,input.wallet))blockers.push('OWNER_REQUIRED');
  if(balance<BigInt(input.initialQuoteIn))blockers.push('INSUFFICIENT_CHOG_BALANCE');
  if(allowance<BigInt(input.initialQuoteIn))blockers.push('FACTORY_APPROVAL_REQUIRED');
  let simulatedTokenAddress=null,gasEstimateRaw=null;
  if(!blockers.length){
    const rpc={from:transaction.from,to:transaction.to,data:transaction.data,value:transaction.value},tag=toQuantity(config.toBlock);
    let result;
    try{result=await provider.send('eth_call',[rpc,tag]);}
    catch(error){if(error.code==='CALL_EXCEPTION')throw new AppError(422,'LAUNCH_REJECTED','Actual factory launch reverted at the recorded block.');throw new AppError(502,'RPC_READ_FAILED','Launch RPC read failed. No fallback simulation is served.');}
    simulatedTokenAddress=iface.decodeFunctionResult('launch',result)[0];
    try{gasEstimateRaw=String(BigInt(await provider.send('eth_estimateGas',[rpc,tag])));}
    catch{throw new AppError(503,'GAS_ESTIMATE_UNAVAILABLE','Same-block launch gas estimation is unavailable.');}
    if(BigInt(gasEstimateRaw)<=0n||BigInt(gasEstimateRaw)>block.gasLimit)throw new AppError(503,'GAS_ESTIMATE_UNAVAILABLE','Launch estimate exceeds the snapshot block limit.');
  }
  if((await provider.getBlock(config.toBlock))?.hash!==block.hash)throw new AppError(503,'CHAIN_REORG','Launch snapshot is no longer canonical.');
  return {snapshot:{blockNumber:block.number,blockHash:block.hash,blockTime:new Date(block.timestamp*1000).toISOString()},params,
    deployment:{factory:factoryAddress,market:marketAddress,vault:vaultAddress,collection,quote:quoteAsset},
    ownership:{ownerAtSnapshot:owner,ownerMatchesWallet:same(owner,input.wallet),policy:'Literal ownerOf only. Operators/custody beneficiaries are not inferred; public inspection proves no signature.'},
    baseline:{supplyRaw:String(supply),creatorAllocationRaw:'0',saleSupplyRaw:String(sales),graduationInventoryRaw:String(supply-sales),openingPriceRaw:String(opening),priceIncreaseRaw:String(increase),targetReserveRaw:String(target),creatorBps:Number(c),studioBps:Number(s),platformBps:Number(p),policy:'Numerical curve/graduation values are observed deployed inputs, not approval of product economics.'},
    funding:{balanceRaw:String(balance),allowanceRaw:String(allowance),spender:factoryAddress,requiredRaw:input.initialQuoteIn},
    preflight:{status:blockers.length?'blocked':'simulated',blockers,simulatedTokenAddress,gasEstimateRaw,initialQuoteSpentRaw:null,initialTokenOutRaw:null,transaction,executionEnabled:false,
      policy:'Actual launch eth_call rolls back token creation, registration, inventory, buy and fees. Factory returns only the token address; actual first-buy spend/output remain unavailable until receipt evidence. Maximum budget is funded first and unused CHOG is refunded. Address and execution can change before inclusion. This API submits nothing; a separately enabled browser wallet flow requires fresh inspection and human confirmation.'}};
}

// A launch approval uses the already validated factory as spender, never an NFT operator.
export async function readLaunchApproval(provider,config,input){
  const state=await readLaunchPreflight(provider,config,input);
  if(!state.ownership.ownerMatchesWallet)throw new AppError(403,'OWNER_REQUIRED','Only the current literal NFT owner may prepare launch funding.');
  const asset=state.deployment.quote,spender=state.deployment.factory;
  const approvalInterface=new Interface(['function approve(address,uint256) returns(bool)']);
  const required=BigInt(state.funding.requiredRaw),allowance=BigInt(state.funding.allowanceRaw),steps=[];
  if(allowance<required){
    for(const [i,amount] of (allowance>0n?[0n,required]:[required]).entries()){
      const transaction=await actionTransaction(provider,config,input.wallet,asset,approvalInterface.encodeFunctionData('approve',[spender,amount]));
      let status='requires-confirmed-reset',gasEstimateRaw=null;
      if(i===0){
        const simulation=await simulateAction(provider,config,state.snapshot,transaction);
        if(simulation.result!=='0x'&&!approvalInterface.decodeFunctionResult('approve',simulation.result)[0])throw new AppError(422,'ACTION_REJECTED','CHOG approval returned false.');
        status='simulated';gasEstimateRaw=simulation.gasEstimateRaw;
      }
      steps.push({kind:amount===0n?'reset':'approve-exact',amountRaw:String(amount),status,gasEstimateRaw,transaction});
    }
  }
  return {...state,approval:{asset,spender,allowanceRaw:String(allowance),requiredRaw:String(required),status:steps.length?'approval-required':'sufficient',steps,executionEnabled:false,
    policy:'Approve only the maximum first-buy CHOG budget to the bound factory. Confirm a reset and refresh before approval; unused launch budget is refunded. No NFT approval or unlimited allowance is requested.'}};
}
