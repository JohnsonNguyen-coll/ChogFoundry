import test from 'node:test';
import assert from 'node:assert/strict';
import { evmFixture } from '../scripts/evm-fixture.mjs';
async function withFixture(fn) { const f = await evmFixture(); try { await fn(f); } finally { await f.close(); } }

test('EVM: only NFT owner registers; approved operator cannot launch; multiple launches survive transfer', () => withFixture(async f => {
  const { ledger, nft, a, b, stranger, addresses, send } = f;
  await assert.rejects(ledger.connect(stranger).registerLaunch(7, 2000, 3000));
  await send(nft.approve(addresses.stranger, 7));
  await assert.rejects(ledger.connect(stranger).registerLaunch(7, 2000, 3000));
  await assert.rejects(ledger.registerLaunch(7, 9000, 2000));
  await assert.rejects(ledger.registerLaunch(999, 2000, 3000));
  await send(ledger.registerLaunch(7, 2000, 3000));
  await send(ledger.registerLaunch(7, 2000, 3000));
  await send(nft.transferFrom(addresses.a, addresses.b, 7));
  // staticCall avoids provider caching an earlier identical estimate across a transfer.
  await assert.rejects(ledger.connect(a).registerLaunch.staticCall(7, 2000, 3000));
  await send(ledger.connect(b).registerLaunch(7, 2000, 3000));
  assert.equal((await ledger.launches(1)).creator, addresses.a);
  assert.equal((await ledger.launches(3)).creator, addresses.b);
}));

test('EVM: fees credit execution-time owner; creator stays A; A claims old credit after transfer', () => withFixture(async f => {
  const { ledger, nft, quote, recorder, a, b, treasury, addresses, send } = f;
  await send(ledger.registerLaunch(7, 2000, 3000));
  await send(ledger.connect(recorder).recordFee(1, 1000));
  await send(nft.transferFrom(addresses.a, addresses.b, 7));
  const receipt = await send(ledger.connect(recorder).recordFee(1, 1000));
  const event = receipt.logs.map(log => { try { return ledger.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'FeeCredited');
  assert.equal(event.args.studioOwner, addresses.b); assert.equal(event.args.creator, addresses.a);
  assert.equal(await ledger.credits(addresses.a), 700n);
  assert.equal(await ledger.credits(addresses.b), 300n);
  assert.equal(await ledger.credits(addresses.treasury), 1000n);
  assert.equal(await ledger.liability(), 2000n);
  await send(ledger.connect(a).claim());
  assert.equal(await quote.balanceOf(addresses.a), 700n);
  await assert.rejects(ledger.connect(a).claim.staticCall());
  await send(ledger.connect(b).claim()); await send(ledger.connect(treasury).claim());
  assert.equal(await ledger.liability(), 0n); assert.equal(await quote.balanceOf(await ledger.getAddress()), 0n);
}));

test('EVM: only immutable recorder can accrue; invalid fees are atomic; tiny rounding goes to platform', () => withFixture(async f => {
  const { ledger, recorder, stranger, quote, addresses, send } = f;
  await send(ledger.registerLaunch(7, 3333, 3333));
  await assert.rejects(ledger.connect(stranger).recordFee(1, 1000));
  await assert.rejects(ledger.connect(recorder).recordFee(99, 1000));
  await assert.rejects(ledger.connect(recorder).recordFee(1, 0));
  assert.equal(await ledger.liability(), 0n);
  await send(ledger.connect(recorder).recordFee(1, 1));
  assert.equal(await ledger.credits(addresses.a), 0n); assert.equal(await ledger.credits(addresses.treasury), 1n);
  assert.equal(await quote.balanceOf(await ledger.getAddress()), await ledger.liability());
}));

test('EVM: token failure and transfer tax do not create debt; failed claim preserves credit', () => withFixture(async f => {
  const { ledger, recorder, quote, addresses, send } = f;
  await send(ledger.registerLaunch(7, 2000, 3000));
  await send(quote.setTax(true));
  await assert.rejects(ledger.connect(recorder).recordFee(1, 1000));
  assert.equal(await ledger.liability(), 0n); assert.equal(await quote.balanceOf(addresses.recorder), 1000000n);
  await send(quote.setTax(false));
  await send(ledger.connect(recorder).recordFee(1, 1000, { gasLimit: 500000 }));
  await send(quote.setFailure(true));
  await assert.rejects(ledger.claim());
  assert.equal(await ledger.credits(addresses.a), 500n); assert.equal(await ledger.liability(), 1000n);
  await send(quote.setFailure(false));
  await send(ledger.claim({ gasLimit: 500000 }));
  assert.equal(await quote.balanceOf(addresses.a), 500n);
}));

test('EVM: burn blocks future accrual but cannot seize existing claims; custody is literal owner', () => withFixture(async f => {
  const { ledger, nft, quote, recorder, b, addresses, send } = f;
  await send(ledger.registerLaunch(7, 2000, 3000));
  await send(ledger.connect(recorder).recordFee(1, 1000));
  await send(nft.burn(7));
  await assert.rejects(ledger.connect(recorder).recordFee.staticCall(1, 1000));
  await send(ledger.claim()); assert.equal(await quote.balanceOf(addresses.a), 500n);
  await send(nft.mint(addresses.b, 8));
  await send(ledger.connect(b).registerLaunch(8, 2000, 3000));
  const custody = await quote.getAddress();
  await send(nft.connect(b).transferFrom(addresses.b, custody, 8));
  await send(ledger.connect(recorder).recordFee(2, 1000));
  assert.equal(await ledger.credits(custody), 300n); assert.equal(await ledger.credits(addresses.b), 200n);
  // May be unclaimable by that contract. No automatic beneficial-owner inference.
}));
