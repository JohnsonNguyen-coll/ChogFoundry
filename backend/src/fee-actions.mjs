import { Contract, Interface, ZeroAddress, toQuantity } from 'ethers';
import { AppError, address } from './validation.mjs';
import { readMarketWindow } from './market-data.mjs';
import { readTradeQuote, tradeInput } from './trade-data.mjs';

const tokenAbi=['function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'];
const tokenInterface=new Interface(tokenAbi);
const vaultAbi=['function credits(address) view returns(uint256 creator,uint256 studio,uint256 platform)','function liability() view returns(uint256)','function claim()'];
const vaultInterface=new Interface(vaultAbi);
export function actionWallet(value){
  if(!value)throw new AppError(400,'WALLET_REQUIRED','Provide the wallet to inspect.');
  const wallet=address(value);
  if(wallet===ZeroAddress)throw new AppError(400,'WALLET_REQUIRED','Provide a nonzero wallet.');
  return wallet;
}
export async function actionTransaction(provider,config,from,to,data){
  const chainId=String(BigInt(await provider.send('eth_chainId',[])));
  if(config.chainId!=null&&BigInt(chainId)!==BigInt(config.chainId))throw new AppError(503,'CHAIN_MISMATCH','Action inspection network mismatch.');
  return {chainId,from,to,data,value:'0x0'};
}
export async function simulateAction(provider,config,snapshot,tx){
  const block=await provider.getBlock(config.toBlock);
  if(block?.hash!==snapshot.blockHash)throw new AppError(503,'CHAIN_REORG','Action snapshot changed.');
  const rpcTx={from:tx.from,to:tx.to,data:tx.data,value:tx.value},tag=toQuantity(config.toBlock);
  let result;
  try{result=await provider.send('eth_call',[rpcTx,tag]);}
  catch(error){
    if(error.code==='CALL_EXCEPTION')throw new AppError(422,'ACTION_REJECTED','Actual contract action reverted at the recorded block.');
    throw new AppError(502,'RPC_READ_FAILED','Action RPC read failed. No fallback is available.');
  }
  let gas;
  try{gas=BigInt(await provider.send('eth_estimateGas',[rpcTx,tag]));}
  catch{throw new AppError(503,'GAS_ESTIMATE_UNAVAILABLE','Same-block action gas estimation is unavailable.');}
  if(gas<=0n||gas>block.gasLimit)throw new AppError(503,'GAS_ESTIMATE_UNAVAILABLE','Action gas estimate is outside the block limit.');
  await canonical(provider,config,snapshot);
  return {result,gasEstimateRaw:String(gas)};
}
async function canonical(provider,config,snapshot){
  if((await provider.getBlock(config.toBlock))?.hash!==snapshot.blockHash)throw new AppError(503,'CHAIN_REORG','Action snapshot is no longer canonical.');
}

export async function readApprovalPlan(provider,config,input){
  input=tradeInput(input.side,input.amountRaw,actionWallet(input.wallet));
  const state=await readTradeQuote(provider,config,input);
  return approvalFromQuote(provider,config,input,state);
}
// Internal preparation path: reuse the same verified, same-block quote.
export async function approvalFromQuote(provider,config,input,state){
  input=tradeInput(input.side,input.amountRaw,actionWallet(input.wallet));
  const asset=state.quote.inputAsset,spender=state.quote.spender;
  const token=new Contract(asset,tokenAbi,provider);
  const allowance=await token.allowance(input.wallet,spender,{blockTag:config.toBlock});
  const required=BigInt(state.quote.requiredInputRaw),steps=[];
  if(allowance<required){
    // Nonzero -> nonzero replacements require a mined reset and a fresh read.
    const amounts=allowance>0n?[0n,required]:[required];
    for(const [i,amount] of amounts.entries()){
      const tx=await actionTransaction(provider,config,input.wallet,asset,tokenInterface.encodeFunctionData('approve',[spender,amount]));
      let gasEstimateRaw=null,status='requires-confirmed-reset';
      if(i===0){
        const simulation=await simulateAction(provider,config,state.snapshot,tx);
        if(simulation.result!=='0x'&&!tokenInterface.decodeFunctionResult('approve',simulation.result)[0])throw new AppError(422,'ACTION_REJECTED','Token approval returned false.');
        gasEstimateRaw=simulation.gasEstimateRaw;status='simulated';
      }
      steps.push({kind:amount===0n?'reset':'approve-exact',amountRaw:String(amount),status,gasEstimateRaw,transaction:tx});
    }
  }
  await canonical(provider,config,state.snapshot);
  return {...state,approval:{asset,spender,allowanceRaw:String(allowance),requiredRaw:String(required),status:steps.length?'approval-required':'sufficient',steps,executionEnabled:false,
    policy:'Exact allowance only. A reset must be confirmed and the plan refreshed before the next approval. Later steps are not simulated with assumed or overridden state. Approval inspection does not simulate the trade or submit any transaction.'}};
}

export async function readClaimPreflight(provider,config,wallet){
  wallet=actionWallet(wallet);
  // Independent of current NFT owner: old credits must remain payable after transfer/burn.
  const state=await readMarketWindow(provider,{...config,fromBlock:config.toBlock,toBlock:config.toBlock});
  const vault=new Contract(state.launch.vault,vaultAbi,provider),quote=new Contract(config.quote,tokenAbi,provider),at={blockTag:config.toBlock};
  const [credits,liability,balance]=await Promise.all([vault.credits(wallet,at),vault.liability(at),quote.balanceOf(state.launch.vault,at)]);
  const total=credits.creator+credits.studio+credits.platform;
  if(balance<liability||total>liability)throw new AppError(503,'VAULT_INSOLVENT','Vault funding or credits are inconsistent.');
  const tx=await actionTransaction(provider,config,wallet,state.launch.vault,vaultInterface.encodeFunctionData('claim'));
  let gasEstimateRaw=null;
  if(total>0n){
    const simulation=await simulateAction(provider,config,state.snapshot,tx);
    if(simulation.result!=='0x')throw new AppError(503,'CLAIM_INCONSISTENT','Unexpected claim response.');
    gasEstimateRaw=simulation.gasEstimateRaw;
  }
  await canonical(provider,config,state.snapshot);
  return {token:state.token,launch:state.launch,snapshot:state.snapshot,claim:{status:total>0n?'simulated':'nothing-to-claim',beneficiary:wallet,recipient:wallet,quoteAsset:config.quote,
    credits:{creatorRaw:String(credits.creator),studioRaw:String(credits.studio),platformRaw:String(credits.platform),totalRaw:String(total)},gasEstimateRaw,transaction:tx,executionEnabled:false,
    policy:'Claims aggregate all launches in this vault and pay the recorded beneficiary. NFT ownership is not claim authority. Read-only simulation submits nothing; refresh credits and chain/account before future signing.'}};
}
