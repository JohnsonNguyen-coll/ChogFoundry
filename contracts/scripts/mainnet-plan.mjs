import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ContractFactory, Interface, JsonRpcProvider, getAddress, getCreateAddress, getCreate2Address, keccak256, zeroPadValue, toBeHex, ZeroAddress } from 'ethers';
import { mainnetEconomics as economics } from '../mainnet-config.mjs';
import { chain } from '../../backend/src/config.mjs';
// Official Monad v4 deployment table, rechecked 2026-10-16. No research snapshot import.
export const poolManager='0x188d586ddcf52439676ca21a244753fa19f9ea8e';
export async function prepareDeployment(provider,deployer,{localFork=false}={}){
  deployer=getAddress(deployer);if(deployer===ZeroAddress)throw new Error('Provide a nonzero public deployer address.');
  const chainId=Number(BigInt(await provider.send('eth_chainId',[])));
  if(localFork){const url=new URL(provider._getConnection().url);if(chainId!==31337||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||(await provider.send('anvil_metadata',[])).forkedNetwork==null)throw new Error('Only child-owned real-state loopback forks are accepted by tests.');}
  else if(chainId!==143)throw new Error('Monad Mainnet RPC is required.');
  const block=await provider.getBlock(localFork?'latest':'finalized');if(!block?.hash)throw new Error('Canonical deployment planning block unavailable.');
  for(const asset of [chain.collection,chain.quote,poolManager])if(await provider.getCode(asset,block.number)==='0x')throw new Error('Required real asset/infrastructure has no code.');
  if(await provider.getCode(deployer,'latest')!=='0x')throw new Error('This deployment plan supports a direct EOA deployer only; contract and delegated wallets require a separate reviewed deployment path.');
  const nonce=await provider.getTransactionCount(deployer,'latest');if(await provider.getTransactionCount(deployer,'pending')!==nonce)throw new Error('Resolve pending deployer transactions before predicting addresses.');
  const compiled=JSON.parse(await readFile(new URL('../artifacts/contracts.json',import.meta.url),'utf8'));
  const artifact=(file,name)=>compiled['src/'+file+'.sol'][name||file];
  const creation=async(file,args=[],name=file)=>(await new ContractFactory(artifact(file,name).abi,artifact(file,name).evm.bytecode.object).getDeployTransaction(...args)).data;
  const addresses={hookDeployer:getCreateAddress({from:deployer,nonce}),lock:getCreateAddress({from:deployer,nonce:nonce+2}),market:getCreateAddress({from:deployer,nonce:nonce+3}),factory:getCreateAddress({from:deployer,nonce:nonce+4}),quoter:getCreateAddress({from:deployer,nonce:nonce+5})};
  const hookCreation=await creation('StudioV4FeeHook',[poolManager,chain.quote,addresses.lock,addresses.factory,economics.creatorBps,economics.studioBps,economics.platformBps]);
  const initCodeHash=keccak256(hookCreation);
  let salt;
  for(let i=0;i<1000000;i++){const candidate=zeroPadValue(toBeHex(i),32),hook=getCreate2Address(addresses.hookDeployer,candidate,initCodeHash);if((BigInt(hook)&0x3fffn)===0x20ccn){salt=candidate;addresses.hook=hook;break;}}
  if(!salt)throw new Error('Hook permission-bit salt search exhausted.');
  for(const value of Object.values(addresses))if(await provider.getCode(value,'latest')!=='0x')throw new Error('Predicted deployment address is already occupied.');
  const steps=[
    {name:'hook-deployer',creates:addresses.hookDeployer,data:await creation('StudioV4FeeHook',[],'StudioHookDeployer')},
    {name:'fee-hook',to:addresses.hookDeployer,creates:addresses.hook,data:new Interface(artifact('StudioV4FeeHook','StudioHookDeployer').abi).encodeFunctionData('deploy',[salt,hookCreation])},
    {name:'liquidity-lock',creates:addresses.lock,data:await creation('StudioV4LiquidityLock',[addresses.market,chain.quote,poolManager,economics.lpFeeUnits,addresses.hook])},
    {name:'curve-market',creates:addresses.market,data:await creation('StudioCurveMarket',[addresses.factory,chain.collection,chain.quote,economics.saleSupplyRaw,economics.openingPriceRaw,economics.priceIncreaseRaw,addresses.lock])},
    {name:'token-factory',creates:addresses.factory,data:await creation('StudioTokenFactory',[chain.collection,chain.quote,addresses.market,addresses.hook,deployer])},
    {name:'v4-quoter',creates:addresses.quoter,data:await creation('StudioV4Quoter',[addresses.lock])}
  ].map((step,i)=>({...step,nonce:nonce+i,transaction:{from:deployer,chainId,nonce:nonce+i,value:'0x0',data:step.data,...(step.to?{to:step.to}:{})},calldataHash:keccak256(step.data),gasEstimateRaw:null}));
  if((await provider.getBlock(block.number))?.hash!==block.hash||await provider.getTransactionCount(deployer,'pending')!==nonce)throw new Error('Chain/deployer nonce changed while preparing deployment.');
  return {chainId,deployer,treasury:deployer,collection:{key:chain.collectionKey,address:chain.collection,name:chain.collectionName,temporary:chain.temporaryCollection},quote:chain.quote,source:{blockNumber:block.number,blockHash:block.hash,blockTime:new Date(block.timestamp*1000).toISOString()},economics,addresses,steps,executionEnabled:false,policy:'Unsigned ordered plan only. Wallet signs each step after preceding canonical deployment verification. Any unrelated deployer transaction changes all predicted addresses: discard and rebuild. Dependent constructors cannot be simulated on Mainnet before their dependencies exist; null gas is intentional. No key or broadcast is used.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const provider=new JsonRpcProvider(chain.rpcUrl,undefined,{batchMaxCount:1,cacheTimeout:-1});
  try{
    if(!process.env.FOUNDRY_DEPLOYER_ADDRESS)throw new Error('Fill FOUNDRY_DEPLOYER_ADDRESS in backend/.env with your public wallet address. Never provide a private key.');
    const plan=await prepareDeployment(provider,process.env.FOUNDRY_DEPLOYER_ADDRESS);await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});await writeFile(new URL('../artifacts/mainnet-deployment-plan.json',import.meta.url),JSON.stringify(plan,(_,value)=>typeof value==='bigint'?String(value):value,2));console.log('Saved unsigned contracts/artifacts/mainnet-deployment-plan.json. No deployment or transaction submitted.');
  }catch{console.error('Deployment plan unavailable. Check public deployer address, RPC, compiled artifacts and pending nonce. No transaction submitted.');process.exitCode=1;}finally{provider.destroy();}
}
