# Read-only trade preparation

GET /api/tokens/:address/quote?side=buy|sell&amountRaw=<positive uint256>&wallet=<optional address>

Buy input is a maximum gross CHOG budget; sell input is token units. Both assets have 18 decimals. Input strings preserve uint256 precision; zero, exponents, leading zeros and overflow are rejected before RPC. Contract getters return actual spend/output, unused buy budget and creator/studio/platform fees. Optional wallet state reports balance/allowance sufficiency at that block, not a guarantee at execution.

GET /api/tokens/:address/account?wallet=<address>

Returns actual token/CHOG balances, curve allowances, recorded creator/studio/platform credits and immutable curve parameters. Fee credits aggregate all launches in the same vault; they are not per-token earnings. Reading another wallet is public inspection and grants no signature, claim or studio permissions. Current studio owner and original creator remain distinct.

Both endpoints require an explicitly configured verified FOUNDRY_FACTORY_ADDRESS. Factory/token/vault/curve/asset bindings, fixed supply, quote decimals and approved curve fee getters are checked. Every call uses one finalized snapshot and canonical hash rechecks; responses include RPC origin, chain, block/hash/time and read time. No Supabase or fork fallback is used for RPC. Application Mainnet access remains read-only.

Graduated tokens use readTradeQuote with an explicitly configured FOUNDRY_V4_QUOTER_ADDRESS. The backend checks quoter lock/manager/market/factory/quote bindings against the actual pool, then executes quoteExactInput through eth_call at the finalized block. Pool swap and hook credits revert inside the callback; returned amounts come from actual deltas and vault counters. No state overrides, token allowance overrides or reserve formulas substitute for execution. Direct readCurveQuote still rejects graduated tokens.

Curve LP fee is zero. V4 responses separately disclose actual protocol category bps and LP fee units (parts per million). LP fees are embedded in pool input/deltas and are not falsely reported as a measured CHOG fee amount; lpFeeAmountRaw is null. Token-exact-input partial fills report actual spend and unused input. The lock pulls the maximum budget first, so balance/allowance sufficiency uses requiredInputRaw, not only eventual spend. This simulation does not test settlement transfer/approval, min output, deadline or gas. Numerical post-graduation economics remain unapproved.

The frontend cancels pending reads and discards quotes when token, wallet, side, amount or indexed cursor changes. Public wallet inspection needs no wallet provider. There is no approval, trade or claim submission. Slippage/minimum output, deadline, gas estimate, fresh transaction simulation and reviewed wallet signing still need implementation against a verified deployment.

Missing deployment: 503 FOUNDRY_NOT_CONFIGURED. Invalid input: 400. Contract-rejected quantity/simulation: 422. Missing v4 quoter: 503 V4_QUOTER_NOT_CONFIGURED. Wrong deployment bindings: 503 V4_QUOTER_MISMATCH. Changed canonical block: 503 CHAIN_REORG. No raw provider secrets/errors are exposed.

Verification uses real Monad-fork contract reads, executed transactions and vault credits. Optional Chromium checks use a test-owned live indexer API; no route interception, wallet mock or seeded production data. Test state never enters the running application.
