import { evmFixture } from './evm-fixture.mjs';
import { CurveExperiment } from '../packages/domain/index.mjs';
console.log('Chog Foundry — LOCAL EVM SPIKE, mock assets only. Fee split is an arbitrary test fixture.');
const f = await evmFixture();
try {
  await f.send(f.ledger.registerLaunch(7, 2000, 3000));
  await f.send(f.ledger.connect(f.recorder).recordFee(1, 1000));
  console.log('A registers launch metadata; mock recorder pays 1000 quote units. A credit:', String(await f.ledger.credits(f.addresses.a)));
  await f.send(f.nft.transferFrom(f.addresses.a, f.addresses.b, 7));
  await f.send(f.ledger.connect(f.recorder).recordFee(1, 1000));
  console.log('After A→B and another mock fee: A=', String(await f.ledger.credits(f.addresses.a)), 'B=', String(await f.ledger.credits(f.addresses.b)), 'treasury=', String(await f.ledger.credits(f.addresses.treasury)));
  await f.send(f.ledger.claim());
  console.log('A claimed after transfer:', String(await f.quote.balanceOf(f.addresses.a)), '; escrow liability:', String(await f.ledger.liability()));
} finally { await f.close(); }
const curve = new CurveExperiment({ supply: 1000n, threshold: 800n, base: 100n, step: 2n, feeBps: 100n });
curve.buy(800n, 10000000n, 0, 1);
const migration = curve.graduate();
console.log('MODEL ONLY graduation accounting:', JSON.stringify(migration, (_, v) => typeof v === 'bigint' ? String(v) : v));
console.log('Not implemented: real token launch/trades, AMM, post-graduation fee capture, treasury buyback, campaign, UI or Monad deployment.');
