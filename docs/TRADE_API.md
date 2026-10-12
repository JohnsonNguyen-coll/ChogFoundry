# Read-only trade preparation

GET /api/tokens/:address/quote?side=buy|sell&amountRaw=<positive uint256>&wallet=<optional address>

Buy input is a maximum gross CHOG budget; sell input is token units. Both assets have 18 decimals. Input strings preserve uint256 precision; zero, exponents, leading zeros and overflow are rejected before RPC. Contract getters return actual spend/output, unused buy budget and creator/studio/platform fees. Optional wallet state reports balance/allowance sufficiency at that block, not a guarantee at execution.

GET /api/tokens/:address/account?wallet=<address>

Returns actual token/CHOG balances, curve allowances, recorded creator/studio/platform credits and immutable curve parameters. Fee credits aggregate all launches in the same vault; they are not per-token earnings. Reading another wallet is public inspection and grants no signature, claim or studio permissions. Current studio owner and original creator remain distinct.

Both endpoints require an explicitly configured verified FOUNDRY_FACTORY_ADDRESS. Factory/token/vault/curve/asset bindings, fixed supply, quote decimals and approved curve fee getters are checked. Every call uses one finalized snapshot and canonical hash rechecks; responses include RPC origin, chain, block/hash/time and read time. No Supabase or fork fallback is used for RPC. Application Mainnet access remains read-only.

Graduated tokens use readTradeQuote with an explicitly configured FOUNDRY_V4_QUOTER_ADDRESS. The backend checks quoter lock/manager/market/factory/quote bindings against the actual pool, then executes quoteExactInput through eth_call at the finalized block. Pool swap and hook credits revert inside the callback; returned amounts come from actual deltas and vault counters. No state overrides, token allowance overrides or reserve formulas substitute for execution. Direct readCurveQuote still rejects graduated tokens.

Curve LP fee is zero. V4 responses separately disclose actual protocol category bps and LP fee units (parts per million). LP fees are embedded in pool input/deltas and are not falsely reported as a measured CHOG fee amount; lpFeeAmountRaw is null. Token-exact-input partial fills report actual spend and unused input. The lock pulls the maximum budget first, so balance/allowance sufficiency uses requiredInputRaw, not only eventual spend. This simulation does not test settlement transfer/approval, min output, deadline or gas. Numerical post-graduation economics remain unapproved.

The frontend cancels pending reads and discards quotes when token, wallet, side, amount or indexed cursor changes. Public wallet inspection needs no wallet provider. There is no approval, trade or claim submission. The settlement inspection below adds minimum output, deadline and actual-wallet simulation; reviewed wallet signing remains unimplemented.

Missing deployment: 503 FOUNDRY_NOT_CONFIGURED. Invalid input: 400. Contract-rejected quantity/simulation: 422. Missing v4 quoter: 503 V4_QUOTER_NOT_CONFIGURED. Wrong deployment bindings: 503 V4_QUOTER_MISMATCH. Changed canonical block: 503 CHAIN_REORG. No raw provider secrets/errors are exposed.

Verification uses real Monad-fork contract reads, executed transactions and vault credits. Optional Chromium checks use a test-owned live indexer API; no route interception, wallet mock or seeded production data. Test state never enters the running application.

## Settlement preflight - 2026-10-10

GET /api/tokens/:address/preflight?side=buy|sell&amountRaw=<positive uint256>&wallet=<nonzero address>&minOutputRaw=<positive uint256>&deadline=<Unix seconds>

Uses the same verified deployment and finalized canonical quote block. Recipient is always the inspected wallet. Deadline is explicit, future relative to both block time and server time, and within one hour (an implementation request limit, not token economics). A blocked result reports actual insufficient balance/approval and a minimum above the fresh quote. It does not fake an approval or report gas for an unexecuted settlement.

When prerequisites pass, eth_call runs the actual curve buy/sell or bound lock swap calldata with the wallet as sender. This includes token pulls, swap, funded hook/vault credits, output transfers and refund checks. Output must match the quote and satisfy minimum output. eth_estimateGas uses the same block, followed by a canonical hash recheck. Unsupported historical estimation returns GAS_ESTIMATE_UNAVAILABLE; no latest-state or numerical fallback is served. All RPC errors are sanitized. No state override, transaction broadcast, signer or approval mutation is used.

Response preflight contains status, blockers, minOutputRaw, deadline, recipient, outputRaw, gasEstimateRaw and unsigned transaction (chainId/from/to/value/data). executionEnabled stays false even after successful simulation. Gas estimate is not a fee quote, gas limit or assurance of inclusion; future signing requires a fresh chain/account/state/deadline check. Public wallet inspection is not authorization to sign as that wallet. Mainnet financial execution remains disabled.

The frontend asks the user to enter slippage and deadline duration without preset values. It computes minimum output with exact integer rounding down and rejects zero minimum. Input/snapshot changes abort and discard stale preflights. The minimum is retained from the reviewed quote while the server checks a fresh quote; changed prices can block the inspection rather than silently weakening protection.

## Approval plan and recorded fee claim - 2026-10-11

GET /api/tokens/:address/approval?side=buy|sell&amountRaw=<positive uint256>&wallet=<nonzero address>

Reuses the verified curve/v4 quote and actual input-asset allowance for its bound spender. Plans approve the exact required funding amount, never an unlimited allowance. If allowance is already sufficient, steps is empty. A nonzero insufficient allowance produces reset-to-zero followed by exact approval; only the first step is actually simulated/estimated. The second is marked requires-confirmed-reset with null gas and must be regenerated after a confirmed reset. No approval state is overridden or assumed. ERC-20 false returns reject; empty success responses are supported. Approval success is not a trade settlement proof.

GET /api/tokens/:address/claim-preflight?wallet=<nonzero beneficiary address>

Validates factory/token/vault/asset bindings independently of current ownerOf. Reads actual category credits, liability and funding at the canonical snapshot. claim() calldata uses the beneficiary as sender and pays that same recorded wallet. Claims aggregate all launches in the vault. No current NFT ownership, profile session or market index grants claim entitlement; there is no redirect-recipient parameter. Zero credits return nothing-to-claim and null gas. Nonzero credits run actual claim settlement and same-block gas estimation without persisting changes.

Both return unsigned transactions, canonical source/provenance and executionEnabled=false. RPC failures are sanitized; unsupported historical gas estimation is explicit. Inspection is not signing permission. The frontend cancels pending action reads and clears results on relevant token/wallet/cursor/quote inputs. No approval/claim/trade broadcast is implemented in runtime.

## Indexed wallet activity - 2026-10-13

GET /api/tokens/:address/wallet-history?wallet=<nonzero address>

Requires a verified factory/deployment index and the primary PostgreSQL repository. The response contains token/launch, canonical snapshot/cursor, index catch-up flags, provenance and walletActivity. It is public inspection and grants no authentication or financial authority.

Balances and incoming/outgoing token amounts derive from the complete mint-to-checkpoint Transfer replay used for holder validation, not the top-50 display or last-500 trades. A missing wallet balance is zero only after complete supply-conserving replay succeeds. Related trade matching is applied before truncation and requires literal payer/recipient evidence; walletRoles separates payment from receipt. Unsupported/legacy v4 rows and external pools are never assigned by transaction sender, token transfers or callbacks.

Counts cover the entire indexed checkpoint history; trades/transfers each return at most the latest 100 matching rows with explicit truncation flags. Catch-up is not latest-chain completeness. Transfer histories include gifts, mint and protocol flows; self-transfers count as both incoming/outgoing while leaving net balance unchanged. pnlRaw and costBasisRaw remain null, and tradeHistoryComplete=false because complete economic history is not established. No last-price valuation or fabricated profit is returned.

Frontend replaces/discards activity when token/wallet/index cursor changes and aborts pending requests. It displays indexed holdings, related buys/sells, separate payer/recipient roles, transfers and canonical source. Reorg rollback removes orphaned rows and restores wallet holdings through existing atomic repository transactions. No schema migration, index rebuild, hosted DB connection or wallet signing is introduced.

## Factory-wide wallet portfolio - 2026-10-13

GET /api/wallets/:address/portfolio

Reads every token window in the configured factory index in one PostgreSQL REPEATABLE READ READ ONLY transaction, together with its checkpoint and revision. Every token must share that checkpoint. Complete per-token mint/transfer replay supplies holdings; tokens with recorded transfers or related trades remain visible even when holdings reach zero. Only literal recorded payer/recipient contributes trade activity. This is a selected-factory portfolio, not all assets on Monad or a complete economic history.

Response contains positions (token/launch/range and wallet activity summary), indexedTokenCount, holdingTokenCount, global unresolved/legacy v4 counts, canonical snapshot/cursor, index catch-up and provenance. Raw quantities remain per asset; they are never added across unlike tokens. PnL/cost basis and USD valuation remain unavailable. No fee credits are summed across tokens sharing one vault.

Capacity is explicit: at most 5,000 total windows, 100,000 total trades plus transfers and 200 tokens. Capacity errors return 503 PORTFOLIO_CAPACITY with no partial/zero fallback. Empty positions require a valid canonical checkpoint and successful replay of every indexed token. Missing configuration, incomplete replay or mismatched checkpoints remain errors. No migration, destructive backfill or stored authenticated wallet profile is introduced.

The dashboard accepts a public address or connected wallet, refreshes sequentially every ten seconds and supports manual refresh. It aborts/discards old-wallet requests, bounds each fetch to 25 seconds, clears data on failure and renders checkpoint/catch-up/capacity limits. Opening a market passes only its actual token address. Public inspection enables no signature or studio authority.
