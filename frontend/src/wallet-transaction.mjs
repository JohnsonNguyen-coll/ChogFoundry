import { pendingFor, recordTransaction } from './transaction-journal.mjs';
// Wallet transport only. Production callers always select chain 143.
// No keys, server signer, state overrides, automatic retries or automatic approvals.
let active=false;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const address=value=>/^0x[0-9a-fA-F]{40}$/.test(value)&&!/^0x0{40}$/i.test(value);
export function reviewedAction(body,kind){
  const action=kind==='approval'?body.approval?.steps?.[0]:body[kind];
  if(action?.status!=='simulated'||!action.gasEstimateRaw||BigInt(action.gasEstimateRaw)<=0n)throw new Error('Refresh and simulate this action before signing.');
  const tx=action.transaction;
  if(!tx||!address(tx.from)||!address(tx.to)||!/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(tx.data)||BigInt(tx.value)!==0n)throw new Error('Invalid prepared transaction.');
  if(!body.snapshot?.blockHash||!Number.isSafeInteger(body.snapshot.blockNumber))throw new Error('Canonical source is required.');
  return {transaction:{chainId:tx.chainId,from:tx.from,to:tx.to,data:tx.data,value:'0x0'},snapshot:body.snapshot,deadline:body.params?.deadline??action.deadline??null,
    fingerprint:JSON.stringify([tx.chainId,tx.from.toLowerCase(),tx.to.toLowerCase(),tx.data.toLowerCase(),action.amountRaw??null,action.credits?.totalRaw??null])};
}
export async function submitReviewedTransaction(provider,review,fresh,{wallet,chainId=143,signal,onState=()=>{}}={}){
  if(active||pendingFor(wallet))throw new Error('Check the pending transaction before sending another one from this account.');
  active=true;let changed=false,submitted=false;
  const invalidate=()=>{changed=true;};
  provider.on?.('accountsChanged',invalidate);provider.on?.('chainChanged',invalidate);
  const check=()=>{signal?.throwIfAborted();if(changed)throw new Error('Wallet or network changed. Refresh the review.');};
  async function identity(){
    check();const network=await provider.request({method:'eth_chainId'}),accounts=await provider.request({method:'eth_accounts'});check();
    if(BigInt(network)!==BigInt(chainId)||!same(accounts[0],wallet)||!same(wallet,review.transaction.from))throw new Error('Connected account or network does not match the review.');
  }
  try{
    await identity();
    if(review.fingerprint!==fresh.fingerprint||BigInt(fresh.transaction.chainId)!==BigInt(chainId))throw new Error('Transaction details changed. Inspect and review again.');
    const tx=fresh.transaction;
    const anchor=await provider.request({method:'eth_getBlockByNumber',params:['0x'+fresh.snapshot.blockNumber.toString(16),false]});
    if(!same(anchor?.hash,fresh.snapshot.blockHash))throw new Error('The reviewed block is no longer canonical.');
    const latest=await provider.request({method:'eth_getBlockByNumber',params:['latest',false]});check();
    if(!latest?.hash)throw new Error('Wallet RPC head is unavailable.');
    if(fresh.deadline&&Number(fresh.deadline)<=Math.max(Date.now()/1000,Number(BigInt(latest.timestamp))))throw new Error('Transaction deadline expired. Refresh the review.');
    const code=await provider.request({method:'eth_getCode',params:[tx.to,latest.number]});if(!code||code==='0x')throw new Error('Transaction target has no contract code.');
    const rpc={from:tx.from,to:tx.to,data:tx.data,value:'0x0'};
    onState({status:'simulating-current-state'});
    const call=await provider.request({method:'eth_call',params:[rpc,latest.number]});
    // ERC-20 approve may return no bytes, but an explicit false must never proceed.
    if(tx.data.slice(0,10).toLowerCase()==='0x095ea7b3'&&call!=='0x'&&BigInt(call)===0n)throw new Error('Token approval returned false.');
    const gas=await provider.request({method:'eth_estimateGas',params:[rpc,latest.number]});
    if(BigInt(gas)<=0n||BigInt(gas)>BigInt(latest.gasLimit))throw new Error('Gas estimation is unavailable.');
    const canonical=await provider.request({method:'eth_getBlockByNumber',params:[latest.number,false]});
    if(!same(canonical?.hash,latest.hash))throw new Error('Chain changed during wallet simulation.');
    await identity();onState({status:'awaiting-wallet'});
    // The wallet chooses gas/fees and asks the human to confirm this exact transaction.
    const hash=await provider.request({method:'eth_sendTransaction',params:[{...rpc,chainId:'0x'+BigInt(chainId).toString(16)}]});
    submitted=true;
    if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new Error('Wallet returned no valid transaction hash. Check wallet activity before retrying.');
    const result={hash,transaction:tx};if(BigInt(chainId)===143n)recordTransaction(result);onState({status:'submitted',hash});return result;
  }catch(error){
    if(error.code===4001||error.code==='ACTION_REJECTED')throw new Error('Transaction rejected in your wallet.');
    if(submitted)throw new Error('Submission returned an unexpected result. Check wallet activity before sending again.');
    throw error;
  }finally{active=false;provider.removeListener?.('accountsChanged',invalidate);provider.removeListener?.('chainChanged',invalidate);}
}
export async function inspectTransaction(provider,hash,expected,chainId=143){
  if(BigInt(await provider.request({method:'eth_chainId'}))!==BigInt(chainId))throw new Error('Switch back to the transaction network to check its receipt.');
  const tx=await provider.request({method:'eth_getTransactionByHash',params:[hash]});
  if(!tx)return {status:'pending-or-replaced',hash};
  if(!same(tx.hash,hash)||!same(tx.from,expected.from)||!same(tx.to,expected.to)||!same(tx.input??tx.data,expected.data)||BigInt(tx.value)!==0n||BigInt(tx.chainId)!==BigInt(chainId))throw new Error('Wallet transaction differs from reviewed calldata. Inspect it in the explorer.');
  const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[hash]});
  if(!receipt)return {status:'pending',hash,nonceRaw:String(BigInt(tx.nonce))};
  if(!same(receipt.transactionHash,hash)||!same(receipt.from,tx.from)||!same(receipt.to,tx.to)||!same(receipt.blockHash,tx.blockHash)||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber))throw new Error('Receipt does not match the submitted transaction.');
  const block=await provider.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});
  if(!same(block?.hash,receipt.blockHash))return {status:'orphaned',hash};
  const finalized=await provider.request({method:'eth_getBlockByNumber',params:['finalized',false]});
  if(!finalized||BigInt(finalized.number)<BigInt(receipt.blockNumber))return {status:'confirming',hash};
  // Recheck the receipt block after reading the finality head.
  const canonical=await provider.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});
  if(!same(canonical?.hash,receipt.blockHash))return {status:'orphaned',hash};
  return {status:BigInt(receipt.status)===1n?'finalized':'reverted',hash,blockNumber:Number(BigInt(receipt.blockNumber)),gasUsedRaw:String(BigInt(receipt.gasUsed))};
}

export async function inspectReplacement(provider,entry,replacementHash){
  if(!/^0x[0-9a-fA-F]{64}$/.test(replacementHash)||same(entry.hash,replacementHash))throw new Error('Enter a different replacement transaction hash from your wallet.');
  const original=await provider.request({method:'eth_getTransactionByHash',params:[entry.hash]});
  const replacement=await provider.request({method:'eth_getTransactionByHash',params:[replacementHash]});
  const nonce=original?.nonce??entry.nonceRaw;
  if(nonce==null||!replacement||!same(replacement.hash,replacementHash)||!same(replacement.from,entry.transaction.from)||BigInt(replacement.nonce)!==BigInt(nonce)||BigInt(replacement.chainId)!==143n)throw new Error('Replacement must have the same sender, nonce and Mainnet chain. Original nonce evidence is required.');
  // Replacements may be native-value cancellation transactions, so validate the actual receipt directly.
  const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[replacementHash]});
  if(!receipt)throw new Error('Replacement has not been included yet.');
  if(!same(receipt.transactionHash,replacementHash)||!same(receipt.blockHash,replacement.blockHash)||BigInt(receipt.blockNumber)!==BigInt(replacement.blockNumber)||!same(receipt.from,replacement.from))throw new Error('Replacement receipt mismatch.');
  const head=await provider.request({method:'eth_getBlockByNumber',params:['finalized',false]});
  const block=await provider.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});
  if(!head||BigInt(head.number)<BigInt(receipt.blockNumber)||!same(block?.hash,receipt.blockHash))throw new Error('Replacement is not canonically finalized yet.');
  if(BigInt(await provider.request({method:'eth_chainId'}))!==143n)throw new Error('Switch back to Monad Mainnet.');
  return {status:'replaced-finalized',replacementHash,replacementSucceeded:BigInt(receipt.status)===1n};
}
