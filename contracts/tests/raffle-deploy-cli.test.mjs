import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Wallet } from 'ethers';

// Isolated temporary test keys only. No .env files, real wallet keys or RPC calls.
const script = fileURLToPath(new URL('../scripts/deploy-raffle.mjs', import.meta.url));
function run(args, config = {}, { production = false } = {}) {
  const env = { ...process.env };
  for (const name of ['PRIVATE_KEY','DEPLOY_MAX_COST_MON','NODE_OPTIONS','FOUNDRY_DEPLOYER_ADDRESS']) delete env[name];
  Object.assign(env, { FOUNDRY_COLLECTION: 'chog-genesis' }, config);
  const preload = new URL('../scripts/chog-collection.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, [...(production ? ['--import', preload] : []), script, ...args], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  if (env.PRIVATE_KEY) assert.ok(!(result.stdout + result.stderr).includes(env.PRIVATE_KEY.replace(/^0x/, '')));
  return result;
}
function rejected(args, config, pattern) {
  const result = run(args, config);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
}
test('raffle CLI rejects missing intent, wrong collection and missing key before RPC', () => {
  rejected([], {}, /Explicit --broadcast/);
  rejected(['--broadcast'], { FOUNDRY_COLLECTION: 'the-daks' }, /Select FOUNDRY_COLLECTION=chog-genesis/);
  rejected(['--broadcast'], {}, /PRIVATE_KEY is empty/);
});
test('raffle CLI rejects invalid keys, gas budgets and mismatched organizer before RPC', () => {
  const wallet = Wallet.createRandom();
  rejected(['--broadcast'], { PRIVATE_KEY: 'invalid-key' }, /64 hexadecimal digits/);
  for (const budget of ['', '-1', 'invalid']) rejected(['--broadcast'], { PRIVATE_KEY: wallet.privateKey, DEPLOY_MAX_COST_MON: budget }, /positive decimal MON/);
  rejected(['--broadcast'], { PRIVATE_KEY: wallet.privateKey, DEPLOY_MAX_COST_MON: '0' }, /greater than zero/);
  rejected(['--broadcast'], { PRIVATE_KEY: wallet.privateKey, DEPLOY_MAX_COST_MON: '1', FOUNDRY_DEPLOYER_ADDRESS: Wallet.createRandom().address }, /does not belong/);
});
test('offline raffle check validates organizer and budget without loading files or broadcasting', () => {
  const wallet = Wallet.createRandom();
  const result = run(['--check-config'], { PRIVATE_KEY: wallet.privateKey.slice(2), DEPLOY_MAX_COST_MON: '1', FOUNDRY_DEPLOYER_ADDRESS: wallet.address });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No RPC, signing or broadcast/);
});
test('production raffle command selects Chog Genesis before config imports despite a legacy Daks environment', () => {
  const wallet = Wallet.createRandom();
  const result = run(['--check-config'], { FOUNDRY_COLLECTION: 'the-daks', PRIVATE_KEY: wallet.privateKey,
    DEPLOY_MAX_COST_MON: '1', FOUNDRY_DEPLOYER_ADDRESS: wallet.address }, { production: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /valid for Chog Genesis/);
  assert.match(result.stdout, /No RPC, signing or broadcast/);
});
