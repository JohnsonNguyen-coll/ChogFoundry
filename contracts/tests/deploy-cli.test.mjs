import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Wallet } from 'ethers';

// No .env is loaded, no RPC is called and no key from the user is read.
const script = fileURLToPath(new URL('../scripts/deploy-mainnet.mjs', import.meta.url));
function reject(args = [], config = {}) {
  const env = { ...process.env };
  delete env.PRIVATE_KEY;
  delete env.DEPLOY_MAX_COST_MON;
  delete env.NODE_OPTIONS;
  Object.assign(env, { FOUNDRY_COLLECTION: 'the-daks' }, config);
  const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Deployment stopped at configuration/);
  assert.equal(result.stdout, '');
  if (env.PRIVATE_KEY) assert.ok(!result.stderr.includes(env.PRIVATE_KEY));
  return result;
}
test('deployment CLI requires explicit broadcast and a signing key without loading any env file', () => {
  reject();
  assert.match(reject(['--broadcast']).stderr, /PRIVATE_KEY is empty or missing/);
});
test('deployment CLI rejects zero/invalid budgets before initializing a provider', () => {
  const key = Wallet.createRandom().privateKey;
  assert.match(reject(['--broadcast'], { PRIVATE_KEY: key }).stderr, /DEPLOY_MAX_COST_MON is empty or missing/);
  assert.match(reject(['--broadcast'], { PRIVATE_KEY: key, DEPLOY_MAX_COST_MON: '0' }).stderr, /greater than zero/);
  assert.match(reject(['--broadcast'], { PRIVATE_KEY: key, DEPLOY_MAX_COST_MON: 'invalid' }).stderr, /positive decimal MON/);
});
test('deployment CLI does not print malformed keys or accept an unrelated signer', () => {
  assert.match(reject(['--broadcast'], { PRIVATE_KEY: 'not-a-signing-key', DEPLOY_MAX_COST_MON: '1' }).stderr, /64 hexadecimal digits/);
  assert.match(reject(['--broadcast'], { PRIVATE_KEY: Wallet.createRandom().privateKey, DEPLOY_MAX_COST_MON: '1', FOUNDRY_DEPLOYER_ADDRESS: '0xadD67137b37E5A61B0566410a8551374dD6a620d' }).stderr, /does not belong/);
});
test('offline config check validates an unfunded cryptographic key without RPC or broadcast', () => {
  const wallet = Wallet.createRandom();
  const env = { ...process.env, FOUNDRY_COLLECTION: 'the-daks', PRIVATE_KEY: wallet.privateKey.slice(2), DEPLOY_MAX_COST_MON: '1', FOUNDRY_DEPLOYER_ADDRESS: wallet.address };
  delete env.NODE_OPTIONS;
  const result = spawnSync(process.execPath, [script, '--check-config'], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No RPC, signing or broadcast/);
  assert.ok(!result.stdout.includes(wallet.privateKey.slice(2)));
});
