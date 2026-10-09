# Actual v4 fee hook verification - 2026-10-09

Actual real-state Monad fork block 111862120, hash 0xcfcb2ddcc16723ee3b56890d6ce2b39e0928a9f666ce9896902b90e502758522. Official PoolManager code hash, pool ID and mined CREATE2 hook address are recorded in V4_HOOK.json. All mutation stayed on child-owned local chain 31337; source Monad chain 143 remained read-only.

Passed: authenticated pool initialization; actual liquidity settlement and four exact-input/output buy/sell modes; fee event comparison with actual PoolManager quote deltas; exact creator/studio integer amounts; funded vault balance equal to liability; zero residual hook quote balance; NFT transfer changes future studio beneficiary while preserving original creator; old-owner claim; an independent callback caller cannot bypass hook fees; swap slippage reverts price, balances and fee liability.

No mocked pool, hook-code override or application data seeds. Independent caller uses another instance of the actual settlement contract; it does not prove Universal Router support. Hook exposes no public own-swap route, avoiding an exposed v4 self-call bypass. Source review/security audit, intended router matrix, partial-fill tests, actual public deployment, quote token privilege review and final economics remain open.

Fork fee inputs are not approved deployment rates. The hooks=0 V4_GRADUATION snapshot remains historical comparison evidence; it does not describe the new hooked path. LP fees remain separately held with the position. Neither snapshot is runtime fallback.
