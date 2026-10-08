import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalOwnership, FeeBook, CurveExperiment, splitFee } from '../packages/domain/index.mjs';
const studio = 'local:mock-chog:7';
function fixture() {
  const ownership = new LocalOwnership(); ownership.register(studio, 'A');
  const fees = new FeeBook(ownership, 'treasury'); fees.register('token1', studio, 'A', 2000n, 3000n);
  return { ownership, fees };
}
function curve() { return new CurveExperiment({ supply: 1000n, threshold: 800n, base: 100n, step: 2n, feeBps: 100n }); }

test('NFT transfer changes future studio credits but preserves creator and old debt', () => {
  const { ownership, fees } = fixture();
  assert.equal(fees.accrue('token1', 1000n).studioOwner, 'A');
  ownership.transfer(studio, 'A', 'B');
  const event = fees.accrue('token1', 1000n);
  assert.equal(event.studioOwner, 'B'); assert.equal(event.creatorWallet, 'A');
  assert.equal(fees.creditOf('A'), 700n); assert.equal(fees.creditOf('B'), 300n);
  assert.equal(fees.creditOf('treasury'), 1000n);
  assert.equal(fees.claim('A'), 700n); assert.equal(fees.balance, fees.liability);
  assert.throws(() => fees.claim('A'), /nothing/);
  assert.throws(() => fees.register('token2', studio, 'A', 2000n, 3000n), /owner/);
  fees.register('token2', studio, 'B', 2000n, 3000n);
});

test('A→B→A invalidates owner sessions and moderator grants permanently', () => {
  const { ownership } = fixture();
  const a = ownership.session(studio, 'A', 1000); const mod = ownership.session(studio, 'mod', 1000);
  ownership.grant(studio, 'A', 'mod');
  assert.ok(ownership.authorize(mod, 'manage', 1));
  assert.throws(() => ownership.authorize(mod, 'launch', 1), /owner/);
  ownership.transfer(studio, 'A', 'B');
  assert.throws(() => ownership.authorize(a, 'launch', 1), /stale/);
  ownership.transfer(studio, 'B', 'A');
  assert.throws(() => ownership.authorize(a, 'launch', 1), /stale/);
  assert.throws(() => ownership.authorize(mod, 'manage', 1), /stale/);
  const newMod = ownership.session(studio, 'mod', 1000);
  assert.throws(() => ownership.authorize(newMod, 'manage', 1), /owner/);
  ownership.grant(studio, 'A', 'mod'); assert.ok(ownership.authorize(newMod, 'manage', 1));
});

test('ownership gaps and expired sessions fail closed; claims do not require NFT', () => {
  const { ownership, fees } = fixture();
  const a = ownership.session(studio, 'A', 2);
  assert.throws(() => ownership.authorize(a, 'manage', 2), /stale/);
  assert.throws(() => ownership.authorize(a, 'unknown', 1), /invalid/);
  fees.accrue('token1', 100n); ownership.setSynchronized(studio, false);
  assert.throws(() => ownership.authorize(a, 'manage', 1), /unavailable/);
  assert.throws(() => fees.accrue('token1', 100n), /unavailable/);
  assert.equal(fees.claim('A'), 50n);
});

test('rounding conserves every unit including tiny fees and invalid inputs', () => {
  for (let amount = 0n; amount < 1000n; amount++) {
    const split = splitFee(amount, 3333n, 3333n);
    assert.equal(split.creator + split.studio + split.platform, amount);
  }
  assert.deepEqual(splitFee(1n, 3333n, 3333n), { creator: 0n, studio: 0n, platform: 1n });
  assert.throws(() => splitFee(1n, 8000n, 3000n), /split/);
  assert.throws(() => splitFee(-1n, 0n, 0n), /invalid/);
  assert.throws(() => splitFee(1, 0n, 0n), /invalid/);
});

test('curve buy/sell preserves reserves and excludes fees; roundtrip costs only fees', () => {
  const market = curve(); const buy = market.buy(10n, 10000n, 0, 1);
  assert.equal(market.state.reserve, buy.net); assert.equal(buy.paid, buy.net + buy.fee);
  const sell = market.sell(10n, 0n, 0, 1);
  assert.equal(sell.gross, buy.net); assert.equal(market.state.reserve, 0n);
  assert.equal(buy.paid - sell.received, buy.fee + sell.fee);
});

test('bad trades leave all state unchanged', () => {
  const market = curve(); const before = market.state;
  for (const trade of [() => market.buy(1n, 0n, 0, 1), () => market.buy(1n, 1000n, 2, 1),
    () => market.buy(801n, 1000000n, 0, 1), () => market.sell(1n, 0n, 0, 1), () => market.buy(0n, 1n, 0, 1)]) {
    assert.throws(trade); assert.deepEqual(market.state, before);
  }
  market.buy(10n, 10000n, 0, 1); const purchased = market.state;
  assert.throws(() => market.sell(1n, 100000n, 0, 1), /slippage/); assert.deepEqual(market.state, purchased);
});

test('deterministic mixed trades conserve cumulative reserve over 250 operations', () => {
  const market = curve(); let seed = 42;
  for (let i = 0; i < 250; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const state = market.state;
    if ((seed >>> 16) % 2 && state.sold > 0n) market.sell(1n, 0n, 0, 1);
    else market.buy(1n, 100000n, 0, 1);
    assert.equal(market.state.reserve, market.cumulative(market.state.sold));
    assert.equal(market.state.inventory + market.state.sold, 1000n);
  }
});

test('graduation accounting handoff requires threshold and runs once', () => {
  const market = curve(); assert.throws(() => market.graduate(), /not ready/);
  market.buy(800n, 10000000n, 0, 1); const before = market.state;
  const migration = market.graduate();
  assert.equal(migration.quote, before.reserve); assert.equal(migration.tokens, 200n);
  assert.equal(market.state.reserve, 0n); assert.equal(market.state.phase, 'graduated');
  assert.throws(() => market.graduate(), /not ready/);
  assert.throws(() => market.buy(1n, 10000n, 0, 1), /closed/);
  assert.throws(() => market.sell(1n, 0n, 0, 1), /closed/);
});

