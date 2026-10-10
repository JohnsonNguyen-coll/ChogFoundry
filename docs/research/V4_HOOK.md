# Actual v4 fee hook verification - 2026-10-09

Actual real-state Monad fork block 111866161, hash 0x954e3532978d796426924e2ccc3b2c153feb023504bed7f9225140c9a1cdf6d7. Official PoolManager code hash, pool ID and mined CREATE2 hook address are recorded in V4_HOOK.json. All mutation stayed on child-owned local chain 31337; source Monad chain 143 remained read-only.

Passed: authenticated pool initialization; actual liquidity settlement and four exact-input/output buy/sell modes; fee event comparison with actual PoolManager quote deltas; exact creator/studio integer amounts; funded vault balance equal to liability; zero residual hook quote balance; NFT transfer changes future studio beneficiary while preserving original creator; old-owner claim; an independent callback caller cannot bypass hook fees; swap slippage reverts price, balances and fee liability.

No mocked pool, hook-code override or application data seeds. Independent caller uses another instance of the actual settlement contract; it does not prove Universal Router support. Hook exposes no public own-swap route, avoiding an exposed v4 self-call bypass. Source review/security audit, intended external router matrix, actual public deployment, quote token privilege review and final economics remain open.

Fork fee inputs are not approved deployment rates. The hooks=0 V4_GRADUATION snapshot remains historical comparison evidence; it does not describe the new hooked path. LP fees remain separately held with the position. Neither snapshot is runtime fallback.


Latest increment: tight Q96 price limits reached on the actual pool. Quote-exact-input and quote-exact-output partial fills fail with the hook InvalidAmount selector; token-exact-output underfill fails with the lock Slippage selector. Actual submitted reverting transactions restore pool price/liquidity, user/lock/manager/hook/vault balances, token/quote allowances and all fee category credits. Token-exact-input partial execution succeeds with actual notional fee credit and unused-input refund. Backend market data includes all six actual PoolManager swaps, including the independent callback route, and does not duplicate router events or infer a trader wallet.

Validation: all six fork suites passed, eight local backend tests and three live RPC/signature tests passed, contracts/frontend build passed. No public deployment or economic approval was introduced. Durable indexing, realtime subscriptions, complete holder backfill and chart UI remain unfinished.
