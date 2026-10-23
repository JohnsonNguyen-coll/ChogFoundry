import test from 'node:test';
import assert from 'node:assert/strict';
import { mainnetSteps } from '../scripts/mainnet-command.mjs';

test('Chog redeployment refreshes the plan and rehearsal before enabling broadcast', () => {
  const input = { FOUNDRY_COLLECTION: 'the-daks', PRIVATE_KEY: 'temporary-test-marker', FOUNDRY_DEPLOYER_ADDRESS: 'public-address' };
  const steps = mainnetSteps(input);
  assert.deepEqual(steps.map(step => step.script), ['mainnet-plan.mjs','mainnet-rehearsal.mjs','deploy-mainnet.mjs']);
  for (const step of steps) assert.equal(step.env.FOUNDRY_COLLECTION, 'chog-genesis');
  for (const step of steps.slice(0, 2)) {
    assert.equal(Object.hasOwn(step.env, 'PRIVATE_KEY'), false);
    assert.deepEqual(step.args, []);
    assert.equal(step.env.FOUNDRY_DEPLOYER_ADDRESS, input.FOUNDRY_DEPLOYER_ADDRESS);
  }
  assert.deepEqual(steps[2].args, ['--broadcast']);
  assert.equal(steps[2].env.PRIVATE_KEY, input.PRIVATE_KEY);
  assert.equal(input.FOUNDRY_COLLECTION, 'the-daks');
});
test('prepare-only excludes the signer and every broadcast step', () => {
  const steps = mainnetSteps({ PRIVATE_KEY: 'temporary-test-marker' }, { prepareOnly: true });
  assert.equal(steps.length, 2);
  assert.ok(steps.every(step => !Object.hasOwn(step.env, 'PRIVATE_KEY') && !step.args.includes('--broadcast')));
});
