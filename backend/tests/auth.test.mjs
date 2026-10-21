import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {AuthService} from '../src/auth.mjs';

// Unit test signature/session policy; no NFT ownership or RPC result is asserted.
const makeAuth=()=>new AuthService({anchor:async()=>({provenance:{blockNumber:1,blockHash:'test-anchor'}})});
test('short-lived nonce creates a 12-hour signed session, reused across page reads',async()=>{
  const auth=makeAuth(),wallet=Wallet.createRandom(),started=Date.now();
  const challenge=await auth.challenge(wallet.address);
  assert.ok(Date.parse(challenge.expiresAt)-started<=301000);
  const {token,session}=auth.verify({...challenge,signature:await wallet.signMessage(challenge.message)});
  assert.ok(session.expires-started>=43199000);
  assert.ok(challenge.message.includes(new Date(session.expires).toISOString()));
  const request={headers:{cookie:`foundry_session=${token}`}};
  assert.equal(auth.session(request,true),session);
  assert.equal(auth.session(request,true),session);
  assert.throws(()=>auth.verify({...challenge,signature:'0x'}),e=>e.code==='INVALID_CHALLENGE');
  assert.match(auth.cookie(token),/HttpOnly; SameSite=Strict/);
  auth.logout(request);assert.equal(auth.session(request),null);
});
test('expired nonce cannot create a long session and expired sessions cannot authenticate',async()=>{
  const auth=makeAuth(),wallet=Wallet.createRandom();
  const challenge=await auth.challenge(wallet.address);
  auth.challenges.get(challenge.challengeId).expires=Date.now()-1;
  assert.throws(()=>auth.verify({...challenge,signature:'0x'}),e=>e.code==='INVALID_CHALLENGE');
  const fresh=await auth.challenge(wallet.address);
  const {token,session}=auth.verify({...fresh,signature:await wallet.signMessage(fresh.message)});
  session.expires=Date.now()-1;
  assert.throws(()=>auth.session({headers:{cookie:`foundry_session=${token}`}},true),e=>e.code==='SIGN_IN_REQUIRED');
});
