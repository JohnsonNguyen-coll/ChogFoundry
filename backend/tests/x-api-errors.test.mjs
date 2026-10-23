import test from 'node:test';
import assert from 'node:assert/strict';
import {XEngagement} from '../src/x-engagement.mjs';
test('X failures distinguish invalid credentials, billing, forbidden access and limits without exposing tokens',async()=>{
  const original=globalThis.fetch;
  try {
    const x=new XEngagement();
    for(const [status,code] of [[401,'X_TOKEN_REJECTED'],[402,'X_PAYMENT_REQUIRED'],[403,'X_ACCESS_FORBIDDEN'],[429,'X_RATE_LIMITED']]){
      globalThis.fetch=async()=>({ok:false,status});
      await assert.rejects(x.read('/users/by/username/ChogNFT','private-test-token'),error=>error.code===code&&error.message.includes(String(status))&&!error.message.includes('private-test-token'));
    }
  }finally{globalThis.fetch=original;}
});
