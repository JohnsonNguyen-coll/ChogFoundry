import {AppError} from './validation.mjs';
import {tradeInput,readTradeQuote} from './trade-data.mjs';
import {actionWallet,approvalFromQuote} from './fee-actions.mjs';
import {preflightInput,preflightFromQuote} from './trade-preflight.mjs';

export function preparationInput(input){
  const trade=tradeInput(input.side,input.amountRaw,actionWallet(input.wallet));
  if(typeof input.slippageBps!=='string'||!/^(0|[1-9][0-9]{0,3})$/.test(input.slippageBps))throw new AppError(400,'INVALID_SLIPPAGE','Choose a maximum price change below 100%.');
  // Validate deadline syntax before touching RPC; the preflight checks chain time.
  preflightInput({...trade,minOutputRaw:'1',deadline:input.deadline});
  return {...trade,slippageBps:input.slippageBps,deadline:input.deadline};
}

export async function readTradePreparation(provider,config,input){
  input=preparationInput(input);
  const state=await readTradeQuote(provider,config,input);
  if(!state.quote.balanceSufficient)throw new AppError(422,'INSUFFICIENT_BALANCE',`You do not have enough ${input.side==='buy'?'CHOG':'tokens'} for this trade.`);
  const minimum=BigInt(state.quote.outputRaw)*(10000n-BigInt(input.slippageBps))/10000n;
  if(minimum<=0n)throw new AppError(422,'INVALID_TRADE_AMOUNT','Increase the amount or reduce the maximum price change.');
  if(!state.quote.allowanceSufficient)return {...await approvalFromQuote(provider,config,input,state),actionKind:'approval'};
  return {...await preflightFromQuote(provider,config,{...input,minOutputRaw:String(minimum)},state),actionKind:'preflight'};
}
