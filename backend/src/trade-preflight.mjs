import { Interface, ZeroAddress, toQuantity } from 'ethers';
import { AppError, address } from './validation.mjs';
import { readTradeQuote, tradeInput } from './trade-data.mjs';

const curve = new Interface([
  'function buy(address,uint256,uint256,address,uint256) returns(uint256)',
  'function sell(address,uint256,uint256,address,uint256) returns(uint256)',
]);
const lock = new Interface(['function swap(address,bool,uint256,uint256,address,uint256) returns(uint256)']);
export function preflightInput(input) {
  const trade = tradeInput(input.side,input.amountRaw,input.wallet);
  if (!trade.wallet || trade.wallet === ZeroAddress) throw new AppError(400,'WALLET_REQUIRED','Provide a nonzero wallet address for settlement inspection.');
  tradeInput(input.side,input.minOutputRaw);
  if (typeof input.deadline !== 'string' || !/^[1-9][0-9]{0,9}$/.test(input.deadline)) throw new AppError(400,'INVALID_DEADLINE','Deadline must be an explicit Unix timestamp in seconds.');
  return {...trade,minOutputRaw:input.minOutputRaw,deadline:input.deadline};
}

// Read-only: no sendTransaction, signer, approval simulation or state override.
export async function readTradePreflight(provider,config,input) {
  input=preflightInput(input);
  const state=await readTradeQuote(provider,config,input);
  const block=await provider.getBlock(config.toBlock);
  if (block?.hash!==state.snapshot.blockHash) throw new AppError(503,'CHAIN_REORG','Preflight block changed.');
  const deadline=Number(input.deadline);
  // An explicit timestamp is evaluated against both the chain and real wall clock.
  const now=Math.max(block.timestamp,Math.floor(Date.now()/1000));
  if (deadline<=now || deadline>now+3600) throw new AppError(400,'INVALID_DEADLINE','Choose a future deadline within one hour.');
  const iface=state.quote.stage==='v4'?lock:curve;
  const method=state.quote.stage==='v4'?'swap':input.side;
  const args=state.quote.stage==='v4'
    ?[config.tokenAddress,input.side==='buy',input.amountRaw,input.minOutputRaw,input.wallet,input.deadline]
    :[config.tokenAddress,input.amountRaw,input.minOutputRaw,input.wallet,input.deadline];
  const chainId=String(BigInt(await provider.send('eth_chainId',[])));
  if (config.chainId!=null && BigInt(chainId)!==BigInt(config.chainId)) throw new AppError(503,'CHAIN_MISMATCH','Preflight network differs from configured network.');
  const transaction={chainId,from:address(input.wallet),to:state.quote.spender,value:'0x0',data:iface.encodeFunctionData(method,args)};
  const blockers=[];
  if (!state.quote.balanceSufficient) blockers.push('INSUFFICIENT_BALANCE');
  if (!state.quote.allowanceSufficient) blockers.push('APPROVAL_REQUIRED');
  if (BigInt(input.minOutputRaw)>BigInt(state.quote.outputRaw)) blockers.push('MINIMUM_OUTPUT_EXCEEDS_QUOTE');
  let outputRaw=null,gasEstimateRaw=null;
  if (!blockers.length) {
    const rpcTx={from:transaction.from,to:transaction.to,value:transaction.value,data:transaction.data};
    const tag=toQuantity(config.toBlock);
    let result;
    try { result=await provider.send('eth_call',[rpcTx,tag]); }
    catch(error) {
      if(error.code==='CALL_EXCEPTION')throw new AppError(422,'SETTLEMENT_REJECTED','Actual wallet settlement reverted. Refresh balances, allowance, minimum output and deadline.');
      throw new AppError(502,'RPC_READ_FAILED','Settlement RPC read failed. No fallback simulation is served.');
    }
    const output=iface.decodeFunctionResult(method,result)[0];
    if(output<BigInt(input.minOutputRaw)||output!==BigInt(state.quote.outputRaw)) throw new AppError(503,'PREFLIGHT_INCONSISTENT','Settlement output differs from the bound quote.');
    outputRaw=String(output);
    try { gasEstimateRaw=String(BigInt(await provider.send('eth_estimateGas',[rpcTx,tag]))); }
    catch { throw new AppError(503,'GAS_ESTIMATE_UNAVAILABLE','Historical gas estimation is unavailable. No latest-block or fabricated gas fallback is served.'); }
    if(BigInt(gasEstimateRaw)<=0n||BigInt(gasEstimateRaw)>block.gasLimit)throw new AppError(503,'GAS_ESTIMATE_UNAVAILABLE','Gas estimate is outside the recorded block limit.');
  }
  if((await provider.getBlock(config.toBlock))?.hash!==state.snapshot.blockHash) throw new AppError(503,'CHAIN_REORG','Preflight snapshot is no longer canonical.');
  return {...state,preflight:{status:blockers.length?'blocked':'simulated',blockers,minOutputRaw:input.minOutputRaw,deadline:input.deadline,recipient:input.wallet,
    outputRaw,gasEstimateRaw,transaction,executionEnabled:false,
    policy:'Unsigned inspection only. No approval or trade is submitted. Recheck chain, account, state, gas and deadline immediately before a separately reviewed wallet signature. Gas estimate is not a gas limit or fee quote.'}};
}
