# CHOG compatibility verification — 2026-10-09

Run npm run test:fork. The compatibility suite uses actual CHOG implementation/state from a finalized Monad block, inside a disposable loopback Anvil fork. It does not deploy a replacement token or override token storage.

Latest recorded observation is in CHOG_COMPATIBILITY.json. Future test runs write fresh output to ignored contracts/artifacts/chog-compatibility.json; they do not rewrite this research snapshot or feed the application.

## Passed at the recorded fork state

- CHOG proxy and implementation bytecode match the upstream block.
- Supply matches the independent upstream read.
- Transfers of zero, one raw unit, 10^12 raw units and one CHOG debit/credit the exact amount.
- Matching Transfer events are emitted, including the zero transfer.
- Approval emits the expected event and sets the observed allowance.
- transferFrom debits/credits the expected amount and reduces a finite allowance correctly.
- Revocation sets allowance to zero.
- A real unauthorized transferFrom transaction reverts without changing tracked balances or supply.
- Insufficient balance and a zero recipient are rejected.
- Maximum-allowance behavior is recorded, rather than assumed from ERC-20.
- Advancing fork time by one day, without token transactions, does not change tracked balances or supply.

The holder is discovered through the real CHOG/WMON V3 factory pool. Holder impersonation and gas funding occur only on the local fork; token balance storage is not edited. This is not a real holder signature or an AMM swap.

## Interpretation

The observed paths are compatible with exact-balance vault accounting at that fork state. The tests do not prove all accounts, amounts, callers, future states or administrative actions behave identically. A time-only observation does not rule out transaction-triggered rebases or privileged mint/burn. Transfer restrictions could exist on other paths or be changed by privileged code.

Consequently sourceVerified, administrativeRightsReviewed and settlementApproved remain false. No live launch, approval, transfer or trade is enabled by this result.

Compiler metadata retrieval was retried against Filebase and 4everland (timeouts) and Lighthouse (HTTP 402). No source was obtained, substituted or guessed. The bytecode-linked metadata CID remains the source-recovery target.

## Shared test harness

Both fee-vault and token compatibility tests use contracts/tests/helpers/monad-fork.mjs. It checks upstream chain 143 and a finalized hash, starts its own loopback child with chain 31337, verifies fork metadata/hash, and cleans up that process. Mutation clients are created only for that local process. backend/.env is loaded for the configured read-only source RPC when running the workspace test command.

Next: obtain and verify implementation source, review privileged/delegation paths, then integrate an approved factory/market. AMM swap compatibility still needs a separate actual-pool experiment.
