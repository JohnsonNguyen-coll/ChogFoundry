# Mainnet launch configuration proposal — 2026-10-16

Status: **user-approved economics on 2026-10-16; deployment and wallet address still pending**. The user selected Monad Mainnet and requested a concrete proposal. The former testnet-first requirement is superseded. Existing approval of fixed supply, zero free allocation and curve fee split remains intact. The user subsequently approved the entire configuration below, then chose the deployer wallet itself as treasury instead of multisig. Historical proposal wording below records the reviewed design; contracts/mainnet-config.mjs now records the approved exact integers.

## Approved immutable economics

| Setting | Proposal |
|---|---|
| Network | Monad Mainnet, chain 143 |
| Quote | Verified CHOG, 18 decimals; current backend address in config.mjs |
| NFT authority | Verified Chog Genesis, literal current ownerOf |
| Supply | 1,000,000,000 tokens, 18 decimals, fixed; already approved |
| Creator allocation | 0; already approved |
| First buy | Optional paid maximum CHOG budget, minimum output and deadline |
| Curve inventory | 625,000,000 tokens (62.5%) |
| Graduation inventory | 375,000,000 tokens (37.5%) |
| Curve | Linear marginal price p(x) = 0.0008 + 0.0032 * x / 625,000,000 CHOG/token |
| Opening price / raw | 0.0008 CHOG/token / 800000000000000 |
| Price increase / raw | 0.0032 CHOG/token / 3200000000000000 |
| Terminal marginal price | 0.004 CHOG/token, excluding fees |
| Graduation reserve | 1,500,000 CHOG net of fees, reached only when sale inventory is fully sold |
| Curve protocol fee | Already approved: 100 bps, creator 30 / studio 30 / platform 40 |
| Graduation venue | Official Monad Uniswap v4 PoolManager, pool-bound fee hook |
| Post-graduation protocol fee | Approved 100 bps, creator 30 / studio 30 / platform 40 |
| LP fee | Approved 3000 v4 units (0.3%), separate basis from CHOG protocol fees |
| LP custody | Permanently held full-range position in immutable lock; no removal/upgrade/rescue |
| LP earnings / rounding dust | Remain held; no beneficiary attribution or harvesting is promised |
| Graduation action | Permissionless explicit graduate call after inventory exhaustion; not automatic on last buy |
| Treasury | Same user-specified public address as deployer; no invented/default address |
| Launch platform charge | None beyond swap fees and actual network gas |

Integer reserve potential uses the existing contract's two rounded-down terms. At full sale, 625,000,000 * (0.0008 + 0.0032/2) = 1,500,000 CHOG. Reserved liquidity tokens * terminal price = 375,000,000 * 0.004 = 1,500,000 CHOG. This matches the contract's graduation continuity constraint before pool integer rounding. Both raw price inputs are exact integers.

Opening fully diluted price measure is 800,000 CHOG; terminal is 4,000,000 CHOG. These are formula-derived token-price measures, not USD valuations, user assets, forecasts or evidence of demand. The reserve target is a product proposal, not calibrated from fabricated usage or market data. A 5x marginal price range also means meaningful price movement for large orders.

Fee display must show 1% protocol and 0.3% embedded LP separately, including rounding, actual CHOG fee amounts and input/output. Do not advertise an exact additive 1.3% of wallet input: bases differ. Hook fees apply to the official bound pool, not externally created token pools.

## Required before deployment

1. Completed: user approved the complete proposal, including irreversible LP/dust policy and protocol fee scope.
2. User supplies intended deployment wallet, also used as treasury; inspect their actual chain/account/balance locally. Never request a private key in chat or save one in the repository.
3. Run the full six real-state fork suites with the reviewed deployment configuration; current old test scales are not proof of this numerical configuration.
4. Review deployment source and CHOG implementation/admin risk; no audit claim is made.
5. Prepare exact ordered unsigned deployment transactions, predicted addresses/CREATE2 hook bits, fees and code bindings; obtain wallet signatures for actual expenditure.
6. Verify receipts/source/immutables and exact factory first-code block before configuring application execution. Connect the actual Supabase project and validate migrations/TLS/indexer.

No Mainnet transaction was submitted by preparing this document. The approved configuration is recorded separately as exact integers; generic contract constructor source remains unchanged. No deployed address or Mainnet transaction is implied.

Sources rechecked 2026-10-16: [Monad network documentation](https://docs.monad.xyz/developer-essentials/network-information), [official v4 deployments](https://developers.uniswap.org/docs/protocols/v4/deployments), [CHOG official site](https://www.chog.xyz/). Existing onchain findings and limits remain in SOURCES.md. NFT absence on testnet is the user's supplied reason; no universal absence claim was independently established.
