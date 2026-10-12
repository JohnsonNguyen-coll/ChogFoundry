# Implementation status — 2026-10-09

## Implemented

- Three npm workspaces: contracts/, backend/, frontend/.
- Live Monad RPC reads for chain/contract identity, $CHOG supply, NFT ownership/URI, wallet balances and bounded Transfer logs. Responses include block/hash/time/source and no fabricated fallback.
- English frontend and API errors, with existing Chog Foundry branding preserved.
- Server-issued wallet sign-in messages with domain, URI, chain ID, nonce, expiry and exact-message signature verification.
- Single-use challenges; five-minute sessions; HttpOnly, SameSite=Strict cookies; exact-origin checks for writes. HTTPS origins enable Secure cookies.
- Owner-managed studio names, descriptions, website and cover URLs persisted to actual SQLite.
- Optimistic revision checks and immutable original author attribution, with revision audit records.
- Before each profile save: current ownerOf, canonical finalized sign-in anchor and bounded scans of every Transfer block since sign-in. Any transfer, including a round trip, rejects the old session for that NFT.
- The public transfer viewer remains a 100-block window and does not claim complete ownership history.
- Three source contracts compile. They are not deployed and do not yet provide a working launchpad.

## Verification

- npm test: 7/7 pass; validation, HTTP rejection, actual SQLite transactions, persistence across reopen, attribution and revision conflicts.
- npm run test:live: 3/3 pass; actual Monad RPC comparisons and real signatures from an unfunded wallet. Verified wrong-signer and replay rejection, exact-origin enforcement, non-owner write denial and logout. Latest quote block observed: 111841555; real NFT token ID: 1557. Owner is read dynamically.
- npm run build: Solidity compilation and Vite production build passed.
- Chrome desktop (1440 px) and mobile (390 px): real NFT lookup and Transfer reads pass; English language, no horizontal overflow or page errors. Screenshots are under ignored artifacts/.
- npm audit --omit=dev: 0 vulnerabilities.
- No deployment, blockchain write, funded transaction or NFT transfer was performed.

## Remaining limitations

- Owner-authorized HTTP saves and A→B→A transfer invalidation have not been exercised end-to-end using a real owner signing and transferring an NFT. Storage behavior is tested separately; non-owner denial is live-tested. Do not claim full transfer-flow verification.
- EOA authentication only; ERC-1271 contract-wallet signatures are unsupported. Owner addresses with code do not imply custody or identify a beneficial owner.
- Authentication is one-process, in-memory and expires on restart. Local SQLite is persistent but requires backups; node:sqlite is experimental on this Node version.
- No durable transfer indexer, moderation epochs or complete reorg-aware public ownership history yet. Bounded scans fail closed on gaps/errors.
- Authorization records a canonical block snapshot. A chain transfer after that snapshot cannot be made atomic with an offchain write. Subsequent writes scan again and reject old authority.
- Curve, AMM, fees, graduation, LP policy and randomness remain undecided. Live creator/studio/platform fee recording and claims are not integrated or deployed; the fee vault has an isolated fork proof.
- Source contracts require broader EVM behavioral tests, market initialization, security review and audit before deployment.
- Club, agent, treasury and campaign remain unimplemented. No fake numbers or launches fill these gaps.
- Competition requirements still need official verification before submission.

## Next implementation work

1. Review actual $CHOG implementation/transfer behavior and Chog contract rights.
2. Investigate real AMM routes and whether studio fees can be credited to each transaction's NFT owner before and after graduation.
3. Implement approved market economics and real contract integration tests before expanding launch/trade UI.
4. Add durable transfer indexing and ownership epochs before moderator grants or long-lived administration.

## Latest research increment — 2026-10-09

- Added npm run check:markets, a standalone read-only inspection with canonical finalized block evidence, exact CHOG minimal-proxy resolution, candidate code hashes, NFT state and actual V3 factory pool reads.
- Added docs/research/LAUNCH_FEASIBILITY.md and a dated MARKET_SNAPSHOT.json; neither supplies application fallback data.
- Proposed Uniswap V4 hook as the next research candidate, while documenting external-pool bypass, self-call exclusions, quote-side delta accounting and source/settlement review gaps.
- Latest validation: npm test 7/7 and npm run test:live 3/3 passed, including an independent live market-inspection test.
- No curve, fee, AMM, LP custody or transfer restriction has been selected. No market/hook contract or financial action was deployed.

## Fee vault increment — 2026-10-09

- StudioFeeVault source added with exact funding checks, current-owner accrual, immutable creator, category credits, beneficiary-only payout and separate liabilities.
- Four source contracts now compile. The fee vault has an isolated real-state fork behavioral test; token/factory/vesting still lack comprehensive behavioral suites.
- Actual CHOG/NFT fork test verifies A→B→A fee credits and historical claims, unauthorized calls, duplicate launch/token registration, donation isolation and a reverted funding transaction.
- Local gas funding and holder/owner impersonation are confined to the child-owned Anvil fork (chain 31337). No mock contracts, application seed data, mainnet writes or real funds.
- Registrar/recorders in the test are test-only EOAs. This does not prove real factory integration, market/hook fee production or graduation.
- No fee rates or AMM were selected. Launch, trade and claims remain unavailable in the application.

- Fee-vault verification record: docs/research/FEE_VAULT_VERIFICATION.md. Latest final-source fork test passed at upstream block 111846511; one earlier run timed out at the real RPC and was rerun without fabricated fallback. npm test 7/7, test:live 3/3 and build passed.

## CHOG compatibility increment — 2026-10-09

- Added exact transfer, approval/allowance/event, revocation, failed transaction rollback and one-day idle-state observations using actual CHOG on a disposable Monad fork.
- Both contract fork suites pass (2/2): quote behavior and NFT-linked vault accounting. Source/admin/settlement review remains incomplete.
- Extracted shared guarded fork harness; test writes only to local child processes and ignored artifacts. Historical evidence is recorded explicitly in docs/research/CHOG_COMPATIBILITY.json.
- No application data, deployed contract configuration or financial action was changed.

- Final validation for the compatibility increment: npm run test:fork 2/2, npm test 7/7 and npm run test:live 3/3 passed. Four Solidity sources compiled during fork validation. No frontend/runtime or economic configuration changes were made.

## NFT discovery and studio directory - 2026-10-09

Wallet responses include actual Chog Genesis token IDs, getter method and canonical provenance. The frontend opens these NFTs through fresh studio reads. Explore shows real persisted profiles or a truthful empty/unavailable state; saving a profile reloads the directory. No seeded profiles or RPC fallback.

Validation: 7 local tests, 3 live RPC/signature tests and contracts/frontend build passed. Desktop (1440px) and mobile (390px) Chromium verified the actual empty directory, refresh and live NFT 1557 lookup; no browser errors or horizontal overflow. Screenshots under ignored artifacts/discovery-*.png were visually checked. Owner-signed profile creation and connected-wallet UI still need an actual user wallet; no wallet provider was simulated.

## Zero-allocation launch coordinator - 2026-10-09

Implemented fixed one-billion factory supply, zero creator allocation, no factory vesting inputs, factory-owned registrar vault, atomic registration/market initialization and optional paid first buy. Incoming/spent quote amounts, actual creator token output, deadline, minimum output and final NFT ownership are checked. Initial-buy events record CHOG input and token output. Source remains undeployed.

Validation: contracts/frontend build passed; all three real-state fork suites passed (CHOG compatibility, fee vault transfer/claims, coordinator NFT authority and actual reverted-transaction rollback). The new coordinator test deliberately calls existing incompatible CHOG code as a market and deploys no mock. Successful initial buy, compatible market, fee calculation, graduation and UI transaction flow remain unverified/unimplemented and are not claimed complete.

## Actual pre-graduation market integration - 2026-10-09

StudioCurveMarket and the updated factory now execute real initial purchases, public buy/sell and funded fee accrual together on an isolated real-state Monad fork. Creator allocation stays zero. At fork block 111857383, the integration suite passed actual initial buy, zero-buy launch, original creator fee continuity, NFT transfer fee ownership, old-beneficiary claim, slippage/launch rollback, capped initial-buy refunds, inventory exhaustion/redemption and donation isolation. All four fork suites passed; five source contracts/frontend build passed. No mock market, live-network writes or application seed data.

Reserve potential, price/supply constructor inputs and integer fee semantics are documented in contracts/README.md. Fork test amounts are not approved product economics. Final curve configuration, real AMM graduation, LP custody, post-graduation fees, testnet deployment and application trading/claim UI remain incomplete. graduationReady is only readiness; no pool is created and sells remain enabled. The requested candles/realtime/holders/profile work is queued after contract flow per user steering.

## Actual v4 migration and held liquidity - 2026-10-09

Implemented StudioV4LiquidityLock and optional atomic market graduation. Actual v4 pool initialization, liquidity settlement and bidirectional swaps passed on real-state Monad fork block 111859589; independent StateView confirmed price/liquidity. Slippage rollback, duplicate graduation, curve closure, failed-migration redemption, NFT transfer custody and historical claim passed. All five contract fork suites passed. Evidence: research/V4_GRADUATION.md/json.

No public deployment. Current pool has hooks=0 and LP fees only; post-graduation studio/creator/platform fee hook is still missing. Pool preinitialization authorization, final numerical economics, reviewed dust/LP fee collection policy and security review remain gates. This completes an actual AMM behavior proof, not the complete product/demo.

## Pool-bound post-graduation fees - 2026-10-09

StudioV4FeeHook and optional immutable lock hook are implemented. Six real-state fork suites passed; strengthened hook tests passed independently at block 111862120. Four swap modes funded creator/studio/platform credits from actual PoolManager quote settlement, including an independent callback caller. PoolManager event comparisons, NFT transfer ownership, original creator continuity, old claim, unauthorized initialization and slippage rollback passed. Evidence: research/V4_HOOK.md/json.

No mainnet/public deployment or mock AMM. Final post-graduation rates/LP-inclusive fees remain open deployment decisions; external routing matrix, partial fills, custody/source/security review and testnet assets/configuration remain gates. LP fees are separate from hook credits and stay in the locked position.


## Price-limited settlement and actual market data - 2026-10-09

Added optional Q96 swap bounds to the v4 lock. Actual partial-fill fork transactions verify prepaid quote-fee rollback, exact-token-output underfill rollback, and partial token-input refund/actual fee credit. Full settlement state/allowances/credits are compared after actual reverts. Latest hooked report: source block 111866161, recorded in research/V4_HOOK.json.

Added GET /api/tokens/:address/market and the onchain market reader. It validates factory/vault/curve/token bindings, reads at most 100 finalized blocks, verifies canonical event hashes, and derives CHOG execution OHLC/volumes without empty-period fabrication. Official PoolManager swaps include independent routes; router identity is not a trader wallet. Holder census exists only with complete constructor-mint-to-snapshot replay; otherwise null. Protocol-held inventory is labeled. Curve and hooked fork suites validate these outputs against actual executed logs/current balances.

Verification: npm test 8/8; npm run test:live 3/3; npm run test:fork 6/6; npm run build and git diff --check passed. No default factory address, public deployment, mainnet writes, fake RPC, seed data or live-fund use. Realtime/SSE/WS, durable indexing/backfill and trading/chart UI remain next work. Current API has explicit FOUNDRY_NOT_CONFIGURED until an actual reviewed deployment is configured.


## Persistent market history and finalized SSE - 2026-10-09

MarketIndexer/MarketStore now discover actual factory launches, backfill contiguous 100-block-bounded windows and commit token trades/transfers with canonical checkpoints in a separate SQLite database. Deployment chain/assets/first-code block/anchor are verified; changed configuration is rejected. Restart resumes from persistent history. Reorg rollback discards later windows and reconstructs candles/holder balances. Catch-up and response truncation are explicit; no market index grants studio permissions.

Added GET /api/market-index, /api/tokens, /api/tokens/:address/history and /stream. SSE sends authoritative replacement snapshots, reorg resets and reconnect snapshots for orphaned cursors. Errors close streams; client count/buffering, listeners, heartbeats and shutdown are bounded. Runtime is finalized Mainnet read-only; a separately guarded test-only loopback fork mode is explicitly labeled local-fork-latest.

Fork source block 111871137 passed actual SQLite reopen, multi-window backfill beyond 100 blocks, real branch replacement with evm_revert, rollback of trade/holder state, HTTP SSE reset and orphaned-cursor reconnect. Hooked source block 111871268 passed indexed initial curve buy plus all six official pool swaps and actual PoolManager holder balance. All six fork suites, eight backend tests, three live tests and contracts/frontend build passed. No mock events, public deployment, application seeds, real funds or default factory configuration. Frontend chart/trade/holder integration remains next work; public-scale pagination/aggregates/load testing are not complete.


## Supabase primary database — 2026-10-09

User decision D19 makes Supabase PostgreSQL authoritative for studio profiles/revisions and canonical market indexes/chunks/windows. Backend uses asynchronous PostgreSQL repositories and one shared TLS-verifying connection pool. Profile edits serialize with optimistic revision checks; chunk commits and reorg rollback are transactional. SSE awaits consistent market snapshots. Missing configuration returns an explicit unavailable error, never SQLite fallback. Existing SQLite files are preserved for a separate, empty-target-only atomic import with consistent backups; no cloud data is overwritten and fork history is rejected.

A private foundry schema migration enables RLS and denies browser roles. Migration/check/import scripts and SUPABASE_SETUP.md are available. Sessions remain in RAM; multi-instance session storage is not implemented. No actual Supabase URL is configured, no hosted migration has run, and health configuration is not a connectivity check.

Verification: 11 backend tests passed, including real PostgreSQL WASM migration/repository execution and browser-role denial. All six real-state fork suites passed; curve source block 111874654 exercised PostgreSQL market persistence, gap rollback and canonical rebuild against actual executed events. Hook source block 111874813 verified actual curve/pool history. Three live RPC tests and contracts/frontend build passed. PGlite is test-only and does not verify hosted Supabase TLS/pooler connectivity. No production seed data, database credentials, mainnet deployment or real-fund transactions.


## Real-data market frontend - 2026-10-10

Implemented the Markets section with indexed token discovery/address lookup, 1m/5m/15m/1h CHOG execution candles, actual buy/sell rows, top holders, original creator/studio links and source/block/hash/time. No fabricated empty candles, USD conversion or inferred traders from callback routers. BigInt preserves raw amounts and 36-decimal prices before normalized SVG pixel conversion. API truncation, chart display limits, protocol holdings and catch-up status are explicit.

History loads before a replace-only SSE stream. Token/interval changes cancel requests and close old streams. Disconnects clear displayed market data; reconnect waits for an authoritative snapshot. Reorg replaces candles/trades/holders and identifies the reset. Local-fork observations are labeled and do not link local transactions to the Mainnet explorer. This is market viewing, not transaction submission.

Verification: npm test 11/11, test:live 3/3, full contracts/frontend build and final frontend build passed. Actual curve fork at source block 112077318 passed frontend exact-price geometry plus optional Chromium verification through a real test-owned indexer API: actual trade/candle/holder counts, branch rollback and orphan-row removal, 1440px/390px layout without overflow or page errors. Screenshots under ignored contracts/artifacts/market-ui-*.png were inspected. No browser request interception, wallet simulation or seeded application data. Other five fork suites were not rerun for this frontend-only change.

Runtime still lacks Supabase configuration and a verified public factory/deployment block. It reports unavailable; test fork data is never a runtime fallback. Buy/sell signing, account positions, fee claims, supported-router trader attribution, indexed pagination and public-scale load testing remain pending.


## Contract quote and wallet fee inspection - 2026-10-10

Implemented read-only /quote and /account endpoints and the market detail forms. Real contract getters expose exact buy/sell amounts, actual CHOG spend/unused maximum budget, fee split, balances, curve allowances and aggregate beneficiary credits. Factory/token/curve/vault/asset bindings and approved fee/decimal getters are checked at one finalized canonical snapshot. Graduated tokens keep wallet inspection but reject curve quotes explicitly. Invalid amounts are rejected before RPC; there is no synthetic quote, signing or Mainnet write.

Verification: 12 backend tests, 3 live tests, full build and final frontend build passed. Curve source block 112079109 passed real buy/sell getter comparison, allowance/balance comparison, old-owner outstanding studio credit after transfer and no-wallet/null behavior. Chromium exercised actual quote/public-wallet lookup on desktop/mobile without a simulated wallet. Hooked source block 112079219 passed real graduated account reads and rejection of the curve quote path. Existing SSE/reorg browser assertions passed with the new panel. No page errors/overflow; ignored market-ui screenshots were reviewed. Only the two affected fork suites were rerun.

Runtime endpoints honestly return FOUNDRY_NOT_CONFIGURED until an actual reviewed deployment is configured. Supabase project connection also remains absent. Transaction signing, slippage/deadline/preflight, v4 quoting, claim submission and economic/testnet asset decisions remain next work.


## Actual graduated v4 quotes - 2026-10-10

Added undeployed StudioV4Quoter: a bound authenticated unlock callback performs actual PoolManager swaps and hook-funded credit observations, then returns a typed revert. The outer method decodes only the fixed-length report; other reverts propagate. No input settlement or token pull exists. Backend validates quoter lock/manager/market/factory/quote bindings, canonical block and result consistency. Graduated quotes require explicit FOUNDRY_V4_QUOTER_ADDRESS; no configured address or fork fallback is provided.

Buy/sell exact-input reports include actual spend/output, unused budget, creator/studio/platform fees and pool LP units. Frontend separates CHOG protocol fee amounts from LP rates; LP fee amount remains null because it is embedded in the pool input/deltas. Approval/balance checks for the lock use the entire pulled budget, even when actual input is partially refunded. Quote is not settlement/min-output/deadline/gas preflight and never submits wallet transactions.

Verification: 12 backend tests, all 6 real-state fork suites and actual v4 Chromium desktop/mobile verification passed. Browser source block 112110775 checked real graduated quotes, wallet state and no overflow/page errors. Full-suite hooked source block 112111203 passed quote-versus-executed buy/sell amounts/fees and unchanged balances/credits after both eth_call and an actual isolated-fork quoter transaction. Images under ignored contracts/artifacts/market-ui-v4-*.png were inspected. No mock pool, state override, public quoter deployment, Mainnet writes or economic approval. Runtime still needs Supabase and verified deployment configuration.

## Actual-wallet settlement preflight - 2026-10-10

Implemented read-only /preflight for curve and bound v4 exact-input buy/sell. Explicit wallet/minimum output/deadline determine unsigned calldata; real balance/allowance and fresh quote can block inspection. With prerequisites satisfied, actual-wallet eth_call includes settlement and same-block eth_estimateGas; canonical hash and output consistency are checked. No approvals, state overrides, signatures, transaction broadcasts or gas fallback.

Frontend supports user-entered slippage/deadline, exact minimum rounding, blockers/gas/unsigned calldata/source and stale-response cancellation. Signing remains unavailable. Missing verified factory/quoter/Supabase configuration remains explicit; none was supplied to runtime.

Validation passed: 13 backend tests, three live read-only RPC tests, eight-source compile/frontend build, and both modified real-state curve/hook fork suites. Latest curve source block 112113845 and hooked source block 112113997 cover buy/sell settlement outputs, unchanged fork balances/fee state, actual missing allowance, too-high minimum and expired deadline. Optional Chromium verifies graduated inspection, stale result removal when slippage changes, real history and desktop/mobile overflow/page errors; actual-wallet browser inspection is blocked by its real remaining allowance. Successful settlement is separately verified by the funded/approved onchain fork checks. No new economics or public/Mainnet deployment.

## Exact approval and recorded-beneficiary claim preparation - 2026-10-11

Implemented read-only approval plans and claim preflights, plus English UI review of asset/spender, exact amount, sequential reset steps, aggregate credits, gas and unsigned calldata. Current-owner lookup is not part of claim inspection. No backend signer, state override, runtime broadcast, infinite approval default or recipient redirect is introduced. Future steps after reset remain explicitly unsimulated until a confirmed reset and fresh read.

Passed 14 backend tests, three live read-only RPC tests and eight-source/frontend build. Latest modified real-state fork suites passed at curve source block 112456334 and hooked source block 112456477. Tests execute API-prepared approval/reset/refreshed-approval calldata and old-beneficiary claim calldata locally, verify sufficient/no-credit cases, and confirm inspection never changes allowance, balances, credits or liability. Fork impersonation does not establish an owner-wallet signature. Optional Chromium verifies actual approval/claim API responses alongside settlement/history on desktop/mobile without request interception, page errors or horizontal overflow.

Public deployment, Supabase cloud connection, wallet signing and broader security/router review remain outstanding. The local development server can show honest unavailable state; no fork deployments/history are copied into runtime configuration. No economics or Mainnet execution approval changed.

## Canonical official trade attribution - 2026-10-12

Implemented factory-bound lock checks and actual PoolTrade/PoolManager Swap correlation for uniquely matched official v4 settlements. Rows expose literal payer/recipient, actual settled input/output and canonical evidence; callback routers never become inferred wallets. Unsupported/missing/ambiguous routes remain null. Candle notional and fee meanings remain unchanged. Indexed summaries flag unresolved/legacy rows, and existing windows/data are preserved without migrations or guessed backfills.

PostgreSQL test-engine indexing preserves attribution and removes it atomically on genuine canonical rollback. Hooked browser source block 112803694 verified five official rows, one independent unresolved route, distinct payer/recipient, actual receipt evidence and branch replacement. The final optimized transaction lookup passed at source block 112804632. Curve browser verification passed at source block 112805286, including existing chart/history/SSE reorg behavior on desktop/mobile. One earlier concurrent browser curve run timed out at 180 seconds; isolated fork and subsequent isolated browser reruns passed. The timeout cause was not established; public capacity/load validation remains outstanding.

Fourteen backend tests, three live read-only RPC tests and eight-source/frontend build passed. No hosted Supabase connectivity, public deployment, wallet signing, Mainnet writes or financial/economic approval is claimed. Prior indexed rows require a separately reviewed canonical rescan to gain new attribution, and arbitrary external/batch/multi-hop routers remain unresolved.

## Token-specific wallet activity - 2026-10-13

Added public indexed /wallet-history and English wallet activity UI. Full validated mint-to-checkpoint replay supplies holdings/token flows, independent of the top-50 holders or last-500 market trades. Full-history payer/recipient matching precedes 100-row wallet display caps. Role, scope, unresolved/legacy, catch-up and truncation fields remain explicit. PnL/cost basis stay null; unknown/external routes, gifts and delegated payments are not converted into economic history. Data is derived on read and is not stored as an authenticated profile.

Passed 14 backend tests, three live read-only RPC tests, eight-source compile/frontend build and modified curve/hooked real-state fork suites. Curve source block 112809452 verifies wallet history and browser replacement after actual branch rollback. Hooked source block 112809580 verifies actual balances, distinct payer/recipient roles, unsupported-router exclusion and PostgreSQL rollback. Actual local token transfers create a small holding outside the top-50 list and prove wallet lookup still returns its real balance without inventing trades. Those disposable fork transfers/wallets never enter production data or configuration. Chromium checks both market and wallet canonical cursors and desktop/mobile rendering without intercepted requests or fake responses.

No schema migration, hosted Supabase connection, public deployment, transaction signing, Mainnet writes or economics decision changed. Multi-token portfolio, pagination, external-router support and complete economic history remain future work.
