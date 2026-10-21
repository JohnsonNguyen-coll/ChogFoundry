import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi} from 'viem';
import {unfinishedLaunch,verifiedLaunchResult} from '../src/launch-completion.mjs';
const wallet='0x'+'11'.repeat(20),token='0x'+'22'.repeat(20),hash='0x'+'33'.repeat(32);
const abi=parseAbi(['function launch((uint256 nftId,string name,string symbol,uint256 initialQuoteIn,uint256 minTokenOut,uint256 deadline) params) returns (address)']);
const entry={hash,status:'finalized',transaction:{chainId:'143',from:wallet,data:encodeFunctionData({abi,functionName:'launch',args:[{nftId:548n,name:'Test',symbol:'T',initialQuoteIn:0n,minTokenOut:0n,deadline:1n}]})}};
test('completion recovers only this studio and wallet, and never reopens older completed launches',()=>{
  assert.equal(unfinishedLaunch([entry],'548',wallet),entry);
  assert.equal(unfinishedLaunch([entry],'549',wallet),null);
  assert.equal(unfinishedLaunch([entry],'548',token),null);
  assert.equal(unfinishedLaunch([{...entry,status:'submitted'}],'548',wallet),null);
  assert.equal(unfinishedLaunch([entry,{...entry,hash:'0x'+'44'.repeat(32),launchOpened:true}],'548',wallet),null);
});
test('navigation requires a verified receipt matching the wallet, NFT, transaction and created token',()=>{
  const body={receipt:{status:'verified-launch',nftId:'548',transactionHash:hash,creator:wallet,tokenAddress:token},token:{address:token},provenance:{chainId:143,finality:'finalized'}};
  const expected={id:'548',hash,wallet};
  assert.equal(verifiedLaunchResult(body,expected),body);
  for(const receipt of [{...body.receipt,status:'simulated'},{...body.receipt,nftId:'549'},{...body.receipt,creator:token},{...body.receipt,tokenAddress:wallet}])assert.throws(()=>verifiedLaunchResult({...body,receipt},expected));
  assert.throws(()=>verifiedLaunchResult({...body,provenance:{chainId:31337,finality:'finalized'}},expected));
});
