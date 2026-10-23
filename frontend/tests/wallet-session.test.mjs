import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalletSession} from '../src/wallet-session.mjs';
const wallet='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20);
async function until(condition){for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.fail('Session did not settle');}
function fixture({existing=null,reject=false}={}){
  let time=1000,server=existing,signs=0;
  const provider={request:async({method})=>{
    if(method==='eth_accounts')return [wallet];if(method==='eth_chainId')return '0x8f';
    if(method==='personal_sign'){signs++;if(reject)throw Object.assign(Error('Rejected'),{code:4001});return 'test-signature';}
    assert.fail('Sign-in must never request a transaction');
  }};
  const controller=createWalletSession({now:()=>time,read:async(route,data)=>{
    if(route==='/session')return {session:server};
    if(route==='/auth/challenge')return {message:'Test sign-in',wallet:data.wallet};
    if(route==='/auth/verify'){server={wallet:data.wallet,expiresAt:new Date(time+1000).toISOString()};return {session:server};}
    if(route==='/auth/logout'){server=null;return {};}
    assert.fail('Unexpected auth request');
  }});
  return {controller,provider,signs:()=>signs,advance:()=>{time+=2000;},allow:()=>{reject=false;}};
}
test('restores an existing session without signing; requests one message on expiry and shares it across consumers',async()=>{
  const f=fixture({existing:{wallet,expiresAt:new Date(2000).toISOString()}}),states=[];
  f.controller.subscribe(()=>states.push(f.controller.snapshot()));
  f.controller.subscribe(()=>assert.equal(f.controller.snapshot().wallet,wallet));
  f.controller.connect(wallet,f.provider);await until(()=>f.controller.snapshot().matches);
  assert.equal(f.signs(),0);
  f.advance();f.controller.tick();f.controller.tick();await f.controller.signIn();
  await until(()=>f.controller.snapshot().matches&&!f.controller.snapshot().busy);
  assert.equal(f.signs(),1);assert.ok(states.some(s=>s.busy));
});
test('cancelled sign-in retries after two seconds; explicit sign-out stops automatic prompts',async()=>{
  const f=fixture({reject:true});f.controller.connect(wallet,f.provider);
  await until(()=>!!f.controller.snapshot().error);assert.equal(f.signs(),1);
  for(let i=0;i<3;i++){f.controller.tick();await f.controller.refresh();}
  assert.equal(f.signs(),1);
  f.advance();f.controller.tick();f.controller.tick();
  await until(()=>f.signs()===2&&!f.controller.snapshot().busy);
  f.allow();await f.controller.signIn();assert.equal(f.controller.snapshot().matches,true);
  await f.controller.signOut();f.advance();f.controller.tick();await f.controller.refresh();
  assert.equal(f.signs(),3);assert.equal(f.controller.snapshot().matches,false);
});

test('automatic sign-in waits while the app tab is hidden',async()=>{
  let active=false,prompts=0;
  const controller=createWalletSession({isActive:()=>active,read:async route=>route==='/session'?{session:null}:{message:'Test'}});
  controller.connect(wallet,{request:async({method})=>method==='eth_accounts'?[wallet]:method==='eth_chainId'?'0x8f':(prompts++,Promise.reject(Object.assign(Error('Rejected'),{code:4001})))});
  await until(()=>!controller.snapshot().checking);controller.tick();assert.equal(prompts,0);
  active=true;controller.tick();await until(()=>prompts===1);
});
test('switching wallets during a signature discards old authorization and serializes the next prompt',async()=>{
  let release,oldPrompts=0,newPrompts=0;const verified=[];
  const controller=createWalletSession({read:async(route,data)=>{
    if(route==='/session')return {session:null};
    if(route==='/auth/challenge')return {message:'Test',wallet:data.wallet};
    if(route==='/auth/verify'){verified.push(data.wallet);return {session:{wallet:data.wallet,expiresAt:new Date(Date.now()+10000).toISOString()}};}
  }});
  const old={request:async({method})=>method==='eth_accounts'?[wallet]:method==='eth_chainId'?'0x8f':new Promise(resolve=>{oldPrompts++;release=resolve;})};
  const next={request:async({method})=>method==='eth_accounts'?[other]:method==='eth_chainId'?'0x8f':(newPrompts++,'new-signature')};
  controller.connect(wallet,old);await until(()=>oldPrompts===1);
  controller.connect(other,next);await controller.refresh();assert.equal(newPrompts,0);
  release('old-signature');await until(()=>controller.snapshot().matches);
  assert.deepEqual(verified,[other]);assert.equal(newPrompts,1);assert.equal(controller.snapshot().session.wallet,other);
});
test('failed session lookup does not request a signature until server verification succeeds',async()=>{
  let prompts=0;
  const controller=createWalletSession({read:async()=>{throw Error('Backend unavailable');}});
  controller.connect(wallet,{request:async()=>{prompts++;}});
  await until(()=>!!controller.snapshot().error);controller.tick();assert.equal(prompts,0);
});
