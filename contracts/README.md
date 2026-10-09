# Contract implementation

- StudioToken: fixed-supply OpenZeppelin ERC-20; minting exists only in the constructor.
- CreatorVesting: immutable beneficiary, allocation and linear vesting schedule.
- StudioTokenFactory: current ownerOf gating and immutable market recipient. Market initialization is still incomplete.
- StudioFeeVault: separate funded creator/studio/platform credits; NFT ownership is resolved at accrual, historical claims never consult current ownerOf.
- research/FeeLedgerSpike.sol: historical research, excluded from compilation and runtime.

Run npm run compile from root. Generated artifacts are ignored under contracts/artifacts/.

## Fee vault boundaries

The registrar permanently binds a unique launch ID and token to an NFT ID, original creator and two trusted fee recorders. Registration checks that the original creator currently owns that NFT. The final factory must perform registration atomically during launch. There is no mutable launch record, rate setting, recorder replacement, reserve withdrawal, admin rescue or upgrade entry point.

Recorders provide explicit raw fee amounts and fund their sum through transferFrom. Exact vault balance changes are checked before credit. The NFT owner is read after external funding, immediately before studio credit. Claims remove recorded category balances and pay only the beneficiary; anyone may trigger claimFor but cannot redirect payment. Exact outgoing and recipient balance changes are checked too. Donations do not create fees or liabilities.

This vault does not prove a trade took place or compute fee economics. Trusted market/hook contracts must calculate correct amounts, enforce pool identity/lifecycle and ensure reserve separation. Source/transfer/admin review of CHOG remains incomplete. Balance checks do not replace that review.

## Isolated fork verification

npm run test:fork compiles sources and starts a disposable Anvil fork from a finalized Monad block. The upstream endpoint is read-only. All writes go to the child-owned loopback process with local chain ID 31337, after checking the pinned fork hash and upstream chain ID 143.

Use an installed Anvil through PATH, or set ANVIL_BIN to its absolute executable path. The test defaults to an ignored workspace tool directory on Windows. With the current official package version:

```powershell
npm install --prefix artifacts/evm-tools --no-save --package-lock=false --ignore-scripts @foundry-rs/anvil-win32-amd64@1.7.1
npm run test:fork
```

This platform package includes the executable. The generic Anvil npm package's postinstall uses a shell assignment that failed under Windows cmd; using the official platform binary avoids that installer issue. Linux/macOS can use the official Foundry installation or ANVIL_BIN.

The test uses the actual CHOG and Chog Genesis code/state from Monad, plus newly deployed Foundry source contracts on the fork. It impersonates real holder/owner addresses only inside that fork and gives them test gas. Recorder/registrar identities are test-only EOAs, not deployed market/hook implementations. No owner signature, public launch or production role configuration is claimed. Raw test amounts are not product fee rates.

Verified behavior includes A→B and B→A transfer credit ordering, old-owner claims, original creator continuity, category separation, donation isolation, replay rejection, unauthorized calls, duplicate token registration and reverted EVM funding transactions.

This is a vault accounting test, not an AMM swap/graduation, API authentication or Monad consensus test. No mocks, mainnet writes or real funds are used. Market/hook integration, fee decisions, deployment configuration, security review and audit remain outstanding.
