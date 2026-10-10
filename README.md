# Chog Foundry

**Your Chog. Your studio. Your next launch.**

Real Monad data and NFT-owned studio profiles. No seeded studios, simulated fees or fake RPC fallback. Foundry contracts are not deployed; launch, trade and claims remain unavailable.

## Run

Node 22.15+ and npm:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API listens on loopback port 3001. On Windows, stop the dev server before running npm ci again to avoid locking Vite native files.

Supabase PostgreSQL is now the primary database. Follow docs/SUPABASE_SETUP.md before using profile/indexed-data endpoints. Copy backend/.env.example to backend/.env. APP_ORIGIN must exactly match the browser origin used for sign-in and profile writes. The default is http://127.0.0.1:5173.

## Workspaces

| Folder | Implementation |
| --- | --- |
| contracts/ | Solidity, OpenZeppelin, compiler and excluded historical research |
| backend/ | Node HTTP API, ethers live RPC reads, signature authentication and Supabase PostgreSQL |
| frontend/ | React/Vite, English interface, NFT lookup and studio profile editor |
| docs/ | Product, decisions, plan, sources and implementation status |

## Use your studio

1. Connect an EVM wallet on Monad Mainnet.
2. Enter your Chog Genesis onchain token ID. Display names may use a different number.
3. Sign in with a wallet message. This does not authorize a transaction.
4. Verify edit access, then save the studio name, description, HTTPS website and cover image URL.

The backend checks current ownerOf and all Transfer logs since the finalized sign-in anchor before each save. A transfer, including A→B→A, requires a new sign-in. Original profile authors and revision history are preserved. Approved operators and inferred custody beneficiaries do not receive editing privileges.

Sessions last at most five minutes and are held in memory. Restarting the backend signs everyone out. EOA signatures are supported; ERC-1271 contract-wallet signatures are not implemented. Profiles now persist in Supabase PostgreSQL. Existing backend/data/ SQLite files are retained for explicit import and are ignored by Git. See docs/SUPABASE_SETUP.md for setup and migration.

Profile writes are authorized against a recorded canonical chain snapshot, not an atomic transaction spanning SQLite and the blockchain. They fail closed on RPC errors, failed log queries, expired sessions, orphaned anchors and excessive scan gaps. A persistent transfer indexer and moderation epochs remain future work.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/health | Process health; does not claim RPC health |
| GET | /api/overview | Verified chain, token and collection data |
| GET | /api/studios | Real profiles saved to this backend |
| GET | /api/studios/:tokenId | Live NFT identity, stored profile and revision attribution |
| GET | /api/studios/:tokenId/transfers | Public transfer window, at most 100 blocks |
| GET | /api/studios/:tokenId/access | Session and fresh ownership/transfer check |
| GET | /api/wallets/:address | Live MON, $CHOG, NFT balances and owned Chog token IDs |
| GET | /api/market-index | Deployment configuration, checkpoint and catch-up status |
| GET | /api/tokens | Tokens discovered from canonical factory launch events |
| GET | /api/tokens/:address/history | Persistent indexed candles, trades and holders |
| GET | /api/tokens/:address/stream | SSE replacement snapshots and reorg resets |
| GET | /api/tokens/:address/market | Finalized bounded trade/candle window and conditional holder census |
| GET | /api/session | Current sign-in identity |
| POST | /api/auth/challenge | Server-issued wallet sign-in message |
| POST | /api/auth/verify | Verify the exact challenge and set session cookie |
| POST | /api/auth/logout | Revoke the session |
| PUT | /api/studios/:tokenId/profile | Owner-checked profile write with expectedRevision |

Onchain responses include source, block number/hash and timestamps. Calls are pinned to one block and checked for canonical hash after the read. No generic RPC relay or server-side arbitrary metadata fetching is exposed.

## Checks

```sh
npm test
npm run test:live
npm run build
```

Local tests use real validation and SQLite transactions. Live tests compare independent RPC reads and exercise real wallet signatures, challenge replay rejection, origin restrictions, non-owner denial and logout. They do not move NFTs or spend funds.

StudioToken, CreatorVesting, StudioTokenFactory and StudioFeeVault compile and remain undeployed/unaudited. The fee vault has isolated real-state fork tests; token/factory/vesting lack comprehensive behavioral suites. Factory initialization and optional first-buy orchestration are implemented in source; a parameterized curve market now has actual initial-buy and buy/sell fork verification. An optional v4 adapter now has actual pool seeding/swaps verification; a pool-bound fee hook now has four-mode funded fee/ownership fork verification. Final deployment economics, routing integration and security review remain incomplete. Creator allocation is zero and curve fee rates are approved. Curve parameters, graduation, final AMM and LP custody remain pending. No club, agent, treasury buyback or campaign is live.

Historical product/decision documents retain the earlier Vietnamese record; new implementation documentation and application copy use English.

## Market research

Run npm run check:markets for a live, read-only inspection of CHOG implementation, NFT state, candidate Uniswap deployments and actual V3 pools. Findings and unresolved settlement/fee-scope questions are in docs/research/LAUNCH_FEASIBILITY.md. The dated snapshot is evidence only; no AMM is configured for Foundry.

## Fee vault fork test

StudioFeeVault source now records funded category credits and preserves claims across NFT transfers. Run npm run test:fork for the isolated real-state Monad fork test. It uses actual CHOG/NFT contracts with local-only writes and test impersonation; it is not a mainnet launch, real wallet signature or AMM integration. See contracts/README.md for Anvil setup and remaining integration boundaries.


## Read-only market data

GET /api/tokens/:address/market?fromBlock=...&toBlock=...&interval=60 reads up to 100 finalized blocks from the explicitly configured FOUNDRY_FACTORY_ADDRESS. The default is the most recent 100 finalized blocks. Factory/market/vault/collection/CHOG/token bindings are checked at the snapshot. Configuration is trusted deployment input, not a certificate of bytecode audit. No factory is configured by default; requests return FOUNDRY_NOT_CONFIGURED rather than fabricated trades.

The response includes chronological curve trades and official v4 PoolManager swaps, including independent callback routes. V4 sender is labeled router; wallet payer/recipient and protocol fee are null because PoolManager events alone do not identify them. Curve payer may be the factory for an initial buy. OHLC uses exact integer execution notional, CHOG per token, excludes protocol fees, includes AMM LP fees in v4 pool deltas, and never fills empty periods. Candle intervals are 60, 300, 900 or 3600 seconds. The window is not complete market history; refreshes must reconcile IDs and finalized ranges rather than append blindly.

Holder count/top balances are provided only when the window contains the constructor mint and complete transfers through the snapshot. Protocol inventory/custody addresses are included and labeled, not counted as known people. Otherwise holders is null with an explicit reason. The bounded window endpoint does not provide durable history by itself; use the indexed endpoints below. No USD price or connected trading UI is claimed. Fork addresses and reports are never application fallback.


## Persistent market index and SSE

Set both FOUNDRY_FACTORY_ADDRESS and FOUNDRY_DEPLOYMENT_BLOCK only for an actual reviewed deployment. The block must be the exact factory first-code block; code before that block must be absent. Runtime indexing checks Mainnet chain ID 143, collection/CHOG identity, deployment/block/code anchors and canonical checkpoint hashes. Both variables are empty by default. No transaction signer is involved.

The single-process indexer discovers launches from TokenLaunched, backfills contiguous batches of at most 100 blocks and persists every token's actual trade/Transfer events with the chunk checkpoint in Supabase PostgreSQL. The market tables use a dedicated foundry schema alongside studio profiles; old SQLite files are not modified. Back up the data directory before future migrations. A changed chain/factory/deployment configuration is rejected rather than rewriting an existing index. Polling runs every three seconds after each scan, up to three chunks per pass. Responses expose indexedThrough, observedHead and caughtUp; they do not call an index behind finality live-current data.

GET /api/tokens/:address/history?interval=60 rebuilds exact candles and mint-to-checkpoint holder balances from persisted canonical events. Protocol market, liquidity lock and PoolManager holdings are labeled. At most 500 trades, 500 candles and 50 top balances are returned, with total counts and truncation flags. Current local query budgets are 5,000 windows per token, 100,000 trades/transfers and 200 indexed tokens; excesses fail explicitly. This single-worker local implementation still needs normalized aggregates/pagination and load testing for a public multi-instance service.

GET /api/tokens/:address/stream?interval=60 uses Server-Sent Events. Each snapshot replaces the displayed dataset; reset signals rollback/rebuild after a canonical branch change. IDs combine durable revision and checkpoint hash. Reconnect always receives a fresh snapshot even when Last-Event-ID refers to an orphaned branch; there is no unsafe append-only replay. Heartbeats run every 15 seconds. RPC errors emit unavailable and close the connection; slow clients and oversized buffers are bounded. The local API allows 16 simultaneous streams. Shutdown closes them and removes listeners/timers.

Reorg recovery finds a prior canonical chunk checkpoint, atomically deletes later windows and rebuilds trades, candles and holders. A deployment-anchor change or a reorg exceeding 1,000 checkpoints fails closed. Authentication/moderator permissions still use the existing independent owner/Transfer/session checks; the market index grants no studio authority.

Fork integration tests use explicitly labeled local-fork-latest reads only on a guarded loopback Anvil chain 31337; Anvil's finalized tag remains anchored to source state. Runtime has no fork mode enabled or fork-address fallback. Tests execute real trades, mine more than 100 local blocks, revert the actual local branch, reopen SQLite and read real HTTP SSE snapshots. Frontend chart/trade integration and public deployment remain next work.


## Supabase primary storage

Supabase PostgreSQL is user-selected primary storage for profiles/revisions and market indexes/checkpoints/event windows. Backend-only SUPABASE_DATABASE_URL is required. Setup, migration, connection checking and one-time SQLite import are in docs/SUPABASE_SETUP.md. Missing or failed Supabase connections return explicit errors without local fallback. Sessions remain in memory. Hosted connection verification is pending until actual project credentials are configured locally; local PostgreSQL engine tests are not a claim of cloud deployment.
