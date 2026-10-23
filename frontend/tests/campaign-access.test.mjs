import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageCampaigns} from '../src/lib/campaign-access.mjs';
test('organizer controls require a matching signed session and server role', () => {
  const auth = {matches:true,wallet:'0xAAA',session:{wallet:'0xaaa'}};
  const configuration = {admin:true,sessionWallet:'0xaaa'};
  assert.equal(canManageCampaigns(auth,configuration),true);
  assert.equal(canManageCampaigns({...auth,wallet:'0xbbb'},configuration),false);
  assert.equal(canManageCampaigns({...auth,matches:false},configuration),false);
  assert.equal(canManageCampaigns(auth,{...configuration,admin:false}),false);
  assert.equal(canManageCampaigns(auth,{admin:true}),false);
  assert.equal(canManageCampaigns(auth,null),false);
});
