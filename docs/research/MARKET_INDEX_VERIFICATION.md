# Persistent market index verification - 2026-10-09

The actual curve fork suite passed at Monad source block 111871137. Mainnet upstream access remained read-only; all deployment/trade/mine/branch mutations used the child-owned loopback Anvil chain 31337 and actual CHOG/Chog Genesis code/state. No mock contracts, fake RPC, fabricated events or application seeds were used.

Verified:

- Exact factory first-code deployment block and pinned deployment/base/code anchors.
- Launch discovery and full initial-buy/normal buy/sell history from real events.
- Contiguous transactional chunks and persistence across closing/reopening actual SQLite files.
- Unchanged sync does not duplicate trades or revise a checkpoint.
- Indexed history spans more than 100 blocks after mining 120 actual local blocks.
- Replayed holder balances match actual token balanceOf, with protocol inventory labeled.
- Real evm_revert branch replacement removes orphaned trades, restores holder balances and changes the durable cursor.
- Actual HTTP SSE emits an authoritative reset snapshot after reorg; reconnecting with an orphaned Last-Event-ID receives the current canonical snapshot.
- Rolled-back state persists across another database reopen.
- Actual wrong-network RPC and changed database configuration are rejected.

The hooked suite passed at source block 111871268, hash 0x13a72daf308c69e056d2e0d290d634d11e05afc6bd8e0e466ec16c57004c3a24. Its index contains the actual creator initial curve buy and six official PoolManager swaps, including an independent callback route. PoolManager token holdings match actual balanceOf and are labeled as protocol custody.

Runtime indexing uses finalized Monad Mainnet blocks. Tests explicitly use guarded local-fork-latest because the fork finalized tag is pinned to its original source state; local fork latest is not claimed to be Monad finality. This proves indexing/HTTP behavior, not Monad consensus, a public deployment or a user NFT signature. Deployment inputs remain unset in the application. Numerical launch/hook/LP parameters are test execution inputs, not newly approved economics.

Current implementation is a bounded single-process local index: 200 tokens, 5,000 event windows per market, 100,000 trades/transfers per query, 500 returned trades/candles, 50 top holder balances, 16 streams and a 1,000-checkpoint reorg audit budget. Public-service aggregates, pagination, load testing, external trader attribution and frontend chart integration remain unfinished. Auth transfer invalidation does not depend on this market index.
