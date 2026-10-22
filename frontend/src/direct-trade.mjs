import {parseAmount} from './market-format.mjs';

export function minimumTradeOutput(outputRaw,slippage){
  if(!/^(0|[1-9][0-9]?)(?:\.[0-9]{1,2})?$/.test(slippage))throw new Error('Enter a maximum price change from 0 to 99.99%.');
  const [whole,fraction='']=slippage.split('.'),bps=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  const output=BigInt(outputRaw),minimum=output*(10000n-bps)/10000n;
  if(output<=0n||minimum<=0n)throw new Error('Increase the trade amount or reduce the maximum price change.');
  return String(minimum);
}

export async function prepareDirectTrade({token,wallet,side,amount,slippage,signal,read,now=Date.now}){
  signal.throwIfAborted();
  const raw=parseAmount(amount),query=new URLSearchParams({side,amountRaw:raw,wallet});
  // Applying protection to 10,000 units yields its exact basis-point value.
  query.set('slippageBps',String(10000n-BigInt(minimumTradeOutput('10000',slippage))));
  query.set('deadline',String(Math.floor(now()/1000)+1200));
  const path=`/api/tokens/${token}/prepare?${query}`,body=await read(path,signal);
  signal.throwIfAborted();
  if(!body.quote?.balanceSufficient)throw new Error(`You do not have enough ${side==='buy'?'CHOG':'tokens'} for this trade.`);
  if(!['approval','preflight'].includes(body.actionKind))throw new Error('The transaction could not be prepared. Please try again.');
  return {kind:body.actionKind,path,body,quote:body};
}
