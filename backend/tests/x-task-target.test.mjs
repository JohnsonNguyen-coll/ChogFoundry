import test from 'node:test';
import assert from 'node:assert/strict';
import {XEngagement} from '../src/x-engagement.mjs';

test('task targets use backend credentials without any linked administrator account', async()=>{
  const previous=process.env.X_BEARER_TOKEN;
  try {
    process.env.X_BEARER_TOKEN='test-app-credential';
    const x=new XEngagement();
    const calls=[];
    x.read=async(route,token)=>{
      calls.push({route,token});
      return route.startsWith('/users/')?{data:{id:'123'}}:{data:{author_id:'123'}};
    };
    assert.equal(await x.target('456'),'123');
    assert.equal(x.tokens.size,0);
    assert.equal(calls.length,2);
    assert.ok(calls.every(call=>call.token==='test-app-credential'));
    x.read=async route=>route.startsWith('/users/')?{data:{id:'123'}}:{data:{author_id:'999'}};
    await assert.rejects(x.target('456'),error=>error.code==='X_TARGET_MISMATCH');
    assert.throws(()=>x.token('0xadmin'),error=>error.code==='X_RELINK_REQUIRED');
    delete process.env.X_BEARER_TOKEN;
    await assert.rejects(x.target('456'),error=>error.code==='X_APP_TOKEN_REQUIRED');
  } finally {
    if(previous===undefined)delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN=previous;
  }
});
