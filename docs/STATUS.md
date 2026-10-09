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
