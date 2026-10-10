# Read-only trade preparation

GET /api/tokens/:address/quote?side=buy|sell&amountRaw=<positive uint256>&wallet=<optional address>

Buy input is a maximum gross CHOG budget; sell input is token units. Both assets have 18 decimals. Input strings preserve uint256 precision; zero, exponents, leading zeros and overflow are rejected before RPC. Contract getters return actual spend/output, unused buy budget and creator/studio/platform fees. Optional wallet state reports balance/allowance sufficiency at that block, not a guarantee at execution.

GET /api/tokens/:address/account?wallet=<address>

Returns actual token/CHOG balances, curve allowances, recorded creator/studio/platform credits and immutable curve parameters. Fee credits aggregate all launches in the same vault; they are not per-token earnings. Reading another wallet is public inspection and grants no signature, claim or studio permissions. Current studio owner and original creator remain distinct.

Both endpoints require an explicitly configured verified FOUNDRY_FACTORY_ADDRESS. Factory/token/vault/curve/asset bindings, fixed supply, quote decimals and approved curve fee getters are checked. Every call uses one finalized snapshot and canonical hash rechecks; responses include RPC origin, chain, block/hash/time and read time. No Supabase or fork fallback is used for RPC. Application Mainnet access remains read-only.

Graduated tokens retain account reads but reject curve quote requests with POST_GRADUATION_QUOTE_UNAVAILABLE. This is not a v4 quoter or post-graduation total-fee estimate. Curve LP fee is zero; post-graduation economics remain separate and unapproved.

The frontend cancels pending reads and discards quotes when token, wallet, side, amount or indexed cursor changes. Public wallet inspection needs no wallet provider. There is no approval, trade or claim submission. Slippage/minimum output, deadline, gas estimate, fresh transaction simulation and reviewed wallet signing still need implementation against a verified deployment.

Missing deployment: 503 FOUNDRY_NOT_CONFIGURED. Invalid input: 400. Contract-rejected quantity or unavailable graduated quote: 422. Changed canonical block: 503 CHAIN_REORG. No raw provider secrets/errors are exposed.

Verification uses real Monad-fork contract reads, executed transactions and vault credits. Optional Chromium checks use a test-owned live indexer API; no route interception, wallet mock or seeded production data. Test state never enters the running application.
