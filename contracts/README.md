# Contract implementation

- StudioToken: fixed-supply OpenZeppelin ERC-20; minting exists only in the constructor.
- CreatorVesting: retained standalone source; not used by the current zero-allocation launch factory.
- StudioTokenFactory: fixed one-billion supply, current ownerOf gating, zero creator allocation, atomic fee-vault registration/market initialization and optional paid initial buy. A compatible market implementation is still missing.
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

## Quote compatibility checks

The CHOG fork suite validates exact transfer/transferFrom amounts, finite allowances, revoke, events, failure rollback and an idle-time observation. Both fork suites share the guarded local harness. Fresh reports go to contracts/artifacts/chog-compatibility.json; recorded findings are in docs/research/CHOG_COMPATIBILITY.md. Source/admin review and settlement approval remain outstanding.

## Revised launch coordinator

The factory deploys its own fee vault with itself as immutable registrar. Each launch creates a fixed one-billion token supply, registers creator/NFT/recorders, transfers all inventory to the fixed protocol market, initializes it, and optionally executes the creator initial buy in one transaction. Creator allocation/vesting parameters were removed. Buy parameters require nonzero minTokenOut and an unexpired deadline; CHOG funding/spend and actual recipient token balances are checked and market allowance cleared. Initialization cannot give free creator tokens. Original creator and input/output are recorded in the launch event.

IStudioLaunchMarket is an integration interface, not a deployed market, curve or AMM adapter. The market must authorize factory initialization, bind the token to this vault/identity, apply approved fees, preserve reserves, quote trades and implement lifecycle. Constructor code-length checks do not certify market/recorder compatibility; deployment configuration still needs verification. No numeric curve or graduation parameter is selected by the factory.

The additional fork test uses actual NFT approval/owner state and deliberately supplies existing CHOG code as an incompatible market. It proves approved operators are denied and a real reverted launch rolls back token deployment, fee registration and launch count. It does not prove a successful initial buy, settlement, graduation or compatible market configuration. No fake market is deployed.

## Actual curve market integration

StudioCurveMarket implements factory-authorized initialization, real CHOG-funded buys/sells and approved curve fee rates (creator 30 / studio 30 / platform 40 bps). Economic inputs saleSupply, openingPrice and priceIncrease are immutable constructor arguments with no defaults. This linear implementation is a reviewable implementation choice, not an approved deployment curve/split/threshold. All launched supply stays in market inventory except purchased tokens; no creator allocation or reserve rescue exists.

Quote notional is the difference of a single cumulative reserve potential: floor(p0*x/1e18) + floor(dp*x*x/(2*saleSupply*1e18)). p0 and dp are raw CHOG units per whole launch token; x and saleSupply are token base units. Both full-precision terms round down; using the same potential for buys and sells preserves telescoping reserves. Total fees round up to 100 bps of base notional; creator/studio round down individually, and platform receives the integer remainder. Buy input is a maximum gross quote budget; monotone integer search finds affordable tokens, only actual cost is spent, and factory refunds any remainder to the creator. Sales deduct fees from base output. Zero-value trades, missing slippage bounds and expired deadlines are rejected.

Fees move into the registered vault atomically. Market totalReserve sums all curve redemption reserves; donations create neither reserves nor fee credits. No creator, studio owner or administrator may withdraw these reserves. Filling saleSupply sets graduationReady, which is explicitly NOT graduation: sells remain available until an explicit successful graduation, and readiness can become false after a sale. An optional immutable v4 adapter now supports migration; approved seeding parameters and post-graduation fee-hook integration are still required before deployment.

The curve integration fork suite executes real initial buys, zero-buy launches, normal buys/sells, NFT transfer and old-owner claims with actual CHOG/NFT code/state. It verifies actual reverted slippage/launch transactions, reserve conservation, original creator continuity, capped initial-buy refunds and donation isolation. Only newly written Foundry contracts are deployed locally; no mock market is used. Test parameters/amounts are execution scales, not approved economics, and do not appear in application responses.

## Actual v4 graduation and liquidity custody

StudioV4LiquidityLock initializes a real TOKEN/CHOG pool via the configured Uniswap v4 PoolManager, adds full-range liquidity with tick spacing 1, settles exact ERC-20 debts in an authenticated unlock callback, and permanently owns the position. No liquidity removal, upgrade, rescue or fee-collection function exists. Rounding dust is explicitly recorded and remains held in the lock. Source choices (full range/tick spacing, LP fee constructor input and permanent custody) are not a finalized deployment policy. There is no default LP fee.

The market only graduates when sale inventory is exhausted and reserve matches terminal-price seeding within two quote base units. Flags/reserve deduction, quote/token approvals, seed call and allowance clearing are atomic. Migration failure preserves redemption. Successful migration disables curve trading; the adapter routes actual v4 swaps with max input, min output, deadline and exact settlement checks. Input leftovers are refunded. Without a hook, a preinitialized incompatible pool can block migration. The new fee hook authenticates initialization from the configured lock.

The original hooks=0 comparison suite charges LP fees only. The adapter now accepts an immutable StudioV4FeeHook for funded protocol fees. LP fees remain in the position and are never reassigned by current NFT ownership at collection. Final deployment configuration and security review remain pending.

The v4 fork suite independently reads real PoolManager bytecode and StateView pool state, executes actual initialization/liquidity settlement/bidirectional swaps, tests slippage rollback and failed migration redemption, and confirms NFT transfers do not change position custody or old fee claims. Fresh report: contracts/artifacts/v4-graduation.json. Snapshot documentation is evidence only, never application data.

## Pool-bound protocol fee hook

StudioV4FeeHook enforces permission bits 0x20cc via actual CREATE2 deployment and exposes only PoolManager callbacks. beforeInitialize accepts the configured lock and exact official pool key, binding the existing immutable factory fee-vault launch. It rejects arbitrary initialization before any official pool state is created. No public hook function performs a swap/unlock, so callers cannot use v4's hook-self-call exemption through a exposed route.

Quote-specified swaps charge a specified-currency delta in beforeSwap; token-specified swaps charge quote as unspecified currency in afterSwap. Both exact input and exact output buy/sell are supported. The hook takes actual CHOG from PoolManager, immediately funds the registered vault and returns an offsetting hook delta; the trader must settle the resulting debt/output. Funding, NFT owner lookup, credits, swap and settlement are atomic. Router identity is not a fee exemption. Pools outside this exact key are not covered.

Creator/studio/platform bps are immutable constructor inputs with no defaults: post-graduation total rates remain a deployment decision. Gross quote input deducts ceil(input*r/(10000+r)); exact net quote output requires ceil(output*10000/(10000-r)); unspecified quote fees use ceil(abs(actual pool quote delta)*r/10000). Category creator/studio credits floor their base-notional shares; platform receives remainder. Quote-specified partial fills reject/rollback rather than retain an overcharged prepaid fee. LP/protocol AMM fees must also appear in actual UI quotes; a simple sum of nominal percentages is not necessarily the exact gross-input cost.

The hook suite checks all four swap modes, real PoolManager event amounts, fee category arithmetic, actual vault funding, transaction-time NFT owner, original creator continuity, old-owner claim, unauthorized callback/initialization rejection, independent PoolManager caller fee capture and slippage credit rollback. An alternate lock instance acts as an independent callback caller; this is not a claim of Universal Router compatibility or proof of every external router. CREATE2 salts are mined normally; no hook-code/address overrides or mock AMMs are used.
