import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTransaction} from '../src/wallet-transaction.mjs';
import {monitorTransactions} from '../src/transaction-monitor.mjs';
const hash='0x'+'ab'.repeat(32),blockHash='0x'+'cd'.repeat(32);
const wallet='0x'+'11'.repeat(20),asset='0x350035555E10d9AfAF1566AaebfCeD5BA6C27777',spender='0x'+'22'.repeat(20);
const data=(amount,target=spender)=>'0x095ea7b3'+target.slice(2).padStart(64,'0')+BigInt(amount).toString(16).padStart(64,'0');
function fixture(actualData,{target=asset,receiptStatus='0x1'}={}){
  const tx={hash,from:wallet,to:target,input:actualData,value:'0x0',chainId:'0x8f',blockNumber:'0x64',blockHash,nonce:'0x1'};
  const receipt={transactionHash:hash,from:wallet,to:target,blockNumber:'0x64',blockHash,status:receiptStatus,gasUsed:'0x1234'};
  return {request:async({method})=>{
    if(method==='eth_chainId')return '0x8f';
    if(method==='eth_getTransactionByHash')return tx;
    if(method==='eth_getTransactionReceipt')return receipt;
    if(method==='eth_getBlockByNumber')return {number:'0x64',hash:blockHash};
    throw Error('Unexpected RPC method; signing is forbidden in this test.');
  }};
}
const expected={from:wallet,to:asset,data:data(10n),value:'0x0'};
test('confirmed wallet-edited ERC20 approval is identified accurately, including legacy CHOG journals',async()=>{
  const result=await inspectTransaction(fixture(data(1100n)),hash,expected);
  assert.equal(result.status,'approval-changed');
  assert.deepEqual(result.changedApproval,{reviewedAmountRaw:'10',approvedAmountRaw:'1100'});
  assert.equal((await inspectTransaction(fixture(data(10n)),hash,expected)).status,'finalized');
  assert.equal((await inspectTransaction(fixture(data(1100n),{receiptStatus:'0x0'}),hash,expected)).status,'reverted');
});
test('changed approval spender and NFT token IDs do not bypass transaction matching',async()=>{
  await assert.rejects(inspectTransaction(fixture(data(1100n,'0x'+'33'.repeat(20))),hash,expected),error=>error.code==='TRANSACTION_MISMATCH');
  const nft='0x'+'44'.repeat(20);
  await assert.rejects(inspectTransaction(fixture(data(1100n),{target:nft}),hash,{...expected,to:nft}),error=>error.code==='TRANSACTION_MISMATCH');
});
test('monitor retries transient reads, advances pending to confirmed, and stops after cancellation',async()=>{
  const controller=new AbortController();let calls=0,updates=[];
  let journal=[{hash,transaction:expected,status:'submitted'}];
  await monitorTransactions({}, {signal:controller.signal,intervalMs:1,entries:()=>journal,
    inspect:async()=>{calls++;if(calls===1)throw Error('Temporary connection loss');return {hash,status:calls===2?'confirming':'finalized'};},
    update:(id,state)=>{updates.push(state);journal=journal.map(entry=>({...entry,...state}));if(state.status==='finalized')controller.abort();},
  });
  assert.equal(calls,3);assert.equal(updates[0].trackingPaused,false);
  assert.equal(journal[0].status,'finalized');assert.equal(journal[0].trackingError,null);
});
test('monitor keeps mismatched transactions blocked and ignores results after abort',async()=>{
  const controller=new AbortController();let count=0;
  await monitorTransactions({}, {signal:controller.signal,entries:()=>[{hash,transaction:expected,status:'submitted'}],
    inspect:async()=>{throw Object.assign(Error('Mismatch'),{code:'TRANSACTION_MISMATCH'});},
    update:(id,state)=>{count++;assert.equal(state.trackingPaused,true);controller.abort();},
  });
  assert.equal(count,1);
  const stopped=new AbortController();
  await monitorTransactions({}, {signal:stopped.signal,entries:()=>[{hash,transaction:expected,status:'submitted'}],
    inspect:async()=>{stopped.abort();return {status:'finalized'};},update:()=>assert.fail('Must not publish after abort'),
  });
});
