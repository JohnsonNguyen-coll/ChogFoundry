import test from 'node:test';
import assert from 'node:assert/strict';
import {communityApi} from '../src/community-api.mjs';

test('task publishing rejects ordinary sessions before reading input or writing storage', async () => {
  const previous=process.env.FOUNDRY_DEPLOYER_ADDRESS;
  process.env.FOUNDRY_DEPLOYER_ADDRESS='0x1111111111111111111111111111111111111111';
  try {
    let session={wallet:'0x2222222222222222222222222222222222222222'};
    const api=communityApi({database:{configured:true},auth:{session:()=>session,checkOrigin(){}},body:()=>{throw new Error('Must not read task input');}});
    let configuration;
    await api({method:'GET'},{},new URL('https://example.com/api/community'),(_status,data)=>{configuration=data;});
    assert.equal(configuration.admin,false);
    assert.equal(configuration.sessionWallet,session.wallet);
    await assert.rejects(api({method:'POST'},{},new URL('https://example.com/api/engagement/tasks'),()=>{}),error=>error.status===403&&error.code==='PLATFORM_ADMIN_REQUIRED');
    session={wallet:process.env.FOUNDRY_DEPLOYER_ADDRESS};
    await api({method:'GET'},{},new URL('https://example.com/api/community'),(_status,data)=>{configuration=data;});
    assert.equal(configuration.admin,true);
    session=null;
    await api({method:'GET'},{},new URL('https://example.com/api/community'),(_status,data)=>{configuration=data;});
    assert.equal(configuration.admin,false);
    assert.equal(configuration.sessionWallet,null);
  } finally {
    if(previous===undefined)delete process.env.FOUNDRY_DEPLOYER_ADDRESS;
    else process.env.FOUNDRY_DEPLOYER_ADDRESS=previous;
  }
});
