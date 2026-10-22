import test from 'node:test';
import assert from 'node:assert/strict';
import {sendWalletAction} from '../src/wallet-action.mjs';

test('direct action rejects unavailable execution, wrong factory, wrong finality and stale preparation before wallet access',async()=>{
  const factory='0x39AE58a1fb0fDc18191fC2e2271B4047B54d3391';
  let calls=0;const provider={request:async()=>{calls++;throw Error('Must not reach wallet');}};
  const args={provider,wallet:'0x392331454Dc8FbF8AAE8958299fD0F5e153a1952',kind:'preflight',signal:new AbortController().signal,permission:{walletExecutionAvailable:true,chainId:143,factory},body:{launch:{factory},provenance:{finality:'finalized',chainId:143,fetchedAt:new Date().toISOString()}}};
  await assert.rejects(sendWalletAction({...args,permission:{...args.permission,walletExecutionAvailable:false}}),/not ready/);
  await assert.rejects(sendWalletAction({...args,body:{...args.body,launch:{factory:'other'}}}),/market changed/);
  await assert.rejects(sendWalletAction({...args,body:{...args.body,provenance:{...args.body.provenance,finality:'latest'}}}),/Confirmed Monad/);
  await assert.rejects(sendWalletAction({...args,body:{...args.body,provenance:{...args.body.provenance,fetchedAt:new Date(Date.now()-60000).toISOString()}}}),/expired/);
  await assert.rejects(sendWalletAction(args),/simulate/);
  assert.equal(calls,0);
});
