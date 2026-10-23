import test from 'node:test';
import assert from 'node:assert/strict';
import {xLinkControl} from '../src/lib/x-link.mjs';
const input={configured:true,loading:false,busy:false,linked:false,auth:{wallet:'wallet',matches:false,busy:false,checking:false},connection:{status:'connected',chainId:143}};
test('link X offers sign-in instead of silently disabling connected wallets',()=>{
  assert.deepEqual(xLinkControl(input),{disabled:false,label:'Sign in and link X',step:'signin'});
  assert.equal(xLinkControl({...input,auth:{...input.auth,matches:true}}).step,'link');
  assert.equal(xLinkControl({...input,auth:{...input.auth,matches:true},linked:true}).label,'Reauthorize X');
});
test('link X explains missing configuration, wallet connection and wrong network',()=>{
  assert.equal(xLinkControl({...input,configured:false}).disabled,true);
  assert.equal(xLinkControl({...input,auth:{wallet:null},connection:{status:'disconnected'}}).step,'connect');
  assert.equal(xLinkControl({...input,connection:{status:'connected',chainId:1},auth:{wallet:null}}).step,'network');
  assert.equal(xLinkControl({...input,connection:{...input.connection,error:'Provider unavailable'}}).step,'reconnect');
  assert.equal(xLinkControl({...input,auth:{...input.auth,busy:true}}).disabled,true);
});
