import {reviewedAction,submitReviewedTransaction} from './wallet-transaction.mjs';

export async function actionRead(path,signal){
  const response=await fetch(path,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
  const body=await response.json();
  if(!response.ok)throw new Error(response.status>=500?'Network data is temporarily unavailable. Please try again.':body.error?.message||'Unable to prepare the transaction.');
  return body;
}

export async function sendWalletAction({provider,wallet,body,kind,path,signal,onState}){
  if(!wallet||!provider)throw new Error('Connect the wallet that will sign this transaction.');
  const permission=await actionRead('/api/execution',signal);
  if(!permission.walletExecutionAvailable||permission.chainId!==143)throw new Error('Mainnet deployment is not ready for wallet transactions.');
  const factory=body.deployment?.factory??body.launch?.factory;
  if(factory?.toLowerCase()!==permission.factory?.toLowerCase())throw new Error('The active market changed. Please try again.');
  const reviewed=reviewedAction(body,kind),freshBody=await actionRead(path,signal);
  if((freshBody.deployment?.factory??freshBody.launch?.factory)?.toLowerCase()!==permission.factory.toLowerCase())throw new Error('The active market changed. Please try again.');
  if(freshBody.provenance?.finality!=='finalized'||freshBody.provenance.chainId!==143)throw new Error('Confirmed Monad data is required to continue.');
  return submitReviewedTransaction(provider,reviewed,reviewedAction(freshBody,kind),{wallet,signal,onState});
}
