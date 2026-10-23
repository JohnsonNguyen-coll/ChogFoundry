import test from 'node:test';
import assert from 'node:assert/strict';
import {communityApi} from '../src/community-api.mjs';
test('admin can publish participation tasks without any X API request',async()=>{
  const previous=process.env.FOUNDRY_DEPLOYER_ADDRESS, originalFetch=globalThis.fetch;
  try{
    const wallet='0x1111111111111111111111111111111111111111';
    process.env.FOUNDRY_DEPLOYER_ADDRESS=wallet;
    globalThis.fetch=()=>{throw new Error('X API must not be called');};
    let inserted;
    const api=communityApi({database:{configured:true,query:async(sql,params)=>{
      if(sql.startsWith('INSERT')){inserted=params;return {rows:[]};}
      return {rows:[{id:inserted[0]}]};
    }},auth:{session:()=>({wallet}),checkOrigin(){}},body:async()=>({kind:'like',title:'Like ChogNFT’s post',targetPostId:'123',points:10,startsAt:new Date(Math.floor(Date.now()/1000)*1000).toISOString(),endsAt:new Date(Math.floor(Date.now()/1000)*1000+14*86400000).toISOString()})});
    let result;
    await api({method:'POST'},{},new URL('https://example.com/api/engagement/tasks'),(_status,data)=>{result=data;});
    assert.ok(result.id);
    assert.equal(inserted[2],'ChogNFT');
  }finally{
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.FOUNDRY_DEPLOYER_ADDRESS;else process.env.FOUNDRY_DEPLOYER_ADDRESS=previous;
  }
});
