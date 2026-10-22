import {reviewedAction,submitReviewedTransaction} from './wallet-transaction.mjs';

export async function actionRead(path,signal){
  const response=await fetch(path,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
  const body=await response.json();
  if(!response.ok)throw new Error(response.status>=500?'Network data is temporarily unavailable. Please try again.':body.error?.message||'Unable to prepare the transaction.');
  return body;
}

export async function sendWalletAction({provider,wallet,body,kind,permission,signal,onState}){
  if(!wallet||!provider)throw new Error('Connect the wallet that will sign this transaction.');
  signal?.throwIfAborted();
  permission??=await actionRead('/api/execution',signal);
  if(!permission.walletExecutionAvailable||permission.chainId!==143)throw new Error('Mainnet deployment is not ready for wallet transactions.');
  const factory=body.deployment?.factory??body.launch?.factory;
  if(factory?.toLowerCase()!==permission.factory?.toLowerCase())throw new Error('The active market changed. Please try again.');
  if(body.provenance?.finality!=='finalized'||body.provenance.chainId!==143)throw new Error('Confirmed Monad data is required to continue.');
  const age=Date.now()-Date.parse(body.provenance.fetchedAt);
  if(!Number.isFinite(age)||age< -5000||age>30000)throw new Error('Transaction preparation expired. Please try again.');
  // This is the fresh result of the Buy/Sell gesture, with no intervening review
  // screen. Wallet transport still rechecks identity, canonical blocks, code,
  // current settlement and gas immediately before requesting the signature.
  const prepared=reviewedAction(body,kind);
  return submitReviewedTransaction(provider,prepared,prepared,{wallet,signal,onState});
}
