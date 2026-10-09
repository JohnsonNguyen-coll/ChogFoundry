# Fee vault verification — 2026-10-09

Source: contracts/src/StudioFeeVault.sol.
Reproduce: npm run test:fork; Anvil setup is documented in contracts/README.md.

## Latest successful run

- Upstream: Monad Mainnet, chain 143, read-only.
- Fork anchor: block 111846511.
- Anchor hash: 0x8479a47b683619022e960a350836ce648fe61af20f8708d412aa79fb7f952bc2.
- Local execution: disposable loopback Anvil, chain 31337.
- Actual inherited contracts/state: Chog Genesis NFT and CHOG from the upstream finalized block.
- NFT token ID: 1557; original owner read from the actual source block, never a hardcoded expected owner.
- New local deployments: StudioToken source and StudioFeeVault source.
- Test-only registry and fee producers: local EOAs; they do not stand in as proof of a deployed market or hook.
- Test-only fee amounts: 21 raw units credited and claimed; 7 raw units donated and excluded from liability. These are accounting inputs, not fee rates or economic defaults.
- Result: 1/1 fork integration test passed.

The real-state fork uses local holder/owner impersonation and local gas funding. No fake RPC, mock NFT/ERC-20 contract or application seed dataset is used. Impersonation is not a real owner's signature and never targets the live chain.

## Verified invariants and cases

- Only the immutable registrar can register a launch.
- Registration permanently binds a unique token and launch ID to the NFT, original creator and authorized recorders.
- Unauthorized recorders, unknown launches, zero amounts and duplicate token/ID registration are rejected.
- Credit is funded by the exact sum of its three components.
- A→B sends subsequent studio credit to B; creator credit stays with A.
- A can claim recorded creator/studio credit while B owns the NFT.
- Permissionless claimFor pays the actual beneficiary, not the caller.
- B→A does not move B's existing credit.
- A third-party donation changes assets, not fee credits or debt.
- An actual EVM transaction with insufficient approval reverts. Assets, credits and liability are unchanged afterward.
- After all claims, totalCredited equals totalClaimed and liability is zero; only the unrelated donation remains.
- No upstream transaction is sent. Source-block ownership is independently read back.

## What is not proved

No swap, bonding curve, graduation, pool creation, LP policy or hook settlement was performed. Registrar/recorders are test-only identities. The factory does not initialize the vault or market yet. The CHOG implementation has not been fully reviewed for transfer/admin/delegation behavior. Reentrancy attacks, malicious/taxed/rebasing assets, complete fuzz/invariant coverage and other contract suites remain outstanding; no mocks were added to cover these gaps.

The current source is undeployed and unaudited. Live launch/trade/claim UI remains unavailable. No product fee rate, AMM or deployment configuration was approved.

One prior verification run encountered an upstream RPC timeout; the final source was rerun successfully without substituting fabricated data.

## Other checks

npm test: 7/7 passed.
npm run test:live: 3/3 passed.
npm run build: four Solidity source contracts compiled and the existing frontend production build passed.
Dependency lock update audit: zero vulnerabilities.
