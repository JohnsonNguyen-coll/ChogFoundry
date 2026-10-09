# Launch and post-graduation fee feasibility

Research date: 2026-10-09. This document records findings and proposals, not an approved AMM, curve or economic configuration.

## Evidence and reproducibility

Run npm run check:markets for a fresh read-only report. To record a dated research observation, run npm run check:markets --workspace @chog-foundry/backend -- --record. The saved MARKET_SNAPSHOT.json is historical evidence, never application fallback data.

The command checks chain ID 143, pins every RPC read to one finalized block and checks its canonical hash afterward. It records bytecode sizes/hashes, CHOG proxy target, NFT administrative state and actual CHOG/WMON V3 pools. It never signs, approves, creates a pool or sends a transaction.

Snapshot: block 111841097, hash 0xd397a299898afb70b24a39b77b5b07eccfad87914c36d5723e845584395bfc2f. Deployment addresses came from the [official Uniswap v4 table](https://developers.uniswap.org/docs/protocols/v4/deployments) and [Monad v3 table](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-monad-deployments). Bytecode presence does not prove a source-equivalent deployment, token settlement safety or successful Foundry integration.

## CHOG and Chog Genesis findings

CHOG is an exact 45-byte [ERC-1167 minimal proxy](https://eips.ethereum.org/EIPS/eip-1167). Its implementation is 0x7f64ccFeb3E3Afd7691ea0ef404E947786cefae8, with 7417 bytes of code and hash 0x6dda419a8059dd56106bc3bc80bb22ffbe6e5a6f37bf42bf3a655a843e341c26. The target is embedded in the proxy runtime. This finding does not rule out special transfer logic, nested delegation or privileged functions in the implementation.

The compiler metadata CID extracted from that implementation is QmVZjs5h5rhtLoV82CyLhVbL24jNNs3tbokRkhdpxcqcDU. The explorer response did not expose verified implementation source, Sourcify returned not verified, and IPFS retrieval attempts encountered HTTP 429, gateway failure or timeout. Source and transfer semantics remain unresolved. The owner() probe reverted; this means unknown method support, not an absence of administrators.

The official CHOG token identity still matches name Chog, symbol CHOG, 18 decimals and the live supply. The live Uniswap V3 factory returned a CHOG/WMON pool at tier 3000 with nonzero active liquidity and a tier 10000 pool with zero active liquidity. Those tiers are existing AMM properties, not proposed Foundry fees. Pool existence does not certify absence of transfer taxes, blacklist, rebase or mint rights.

The [NFT explorer](https://monadscan.com/address/0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763#code) exposes ChogMint source inheriting OpenZeppelin ERC721, ERC2981, AccessControl and ReentrancyGuard. Inspection found administrative mint/configuration/treasury/royalty and reveal methods. The retrieved main source has no custom ownerOf or transfer override; it has not been independently recompiled or fully audited. Administrator identities have not been exhaustively indexed. Literal ownerOf remains the ownership rule; approval or marketplace custody does not establish a beneficial owner.

## AMM comparison

| Candidate | Evidence | Per-swap studio credit | Assessment |
| --- | --- | --- | --- |
| Uniswap v4 with a Foundry hook | Official Monad addresses plus live code; upstream hooks and PoolManager reviewed | Plausible inside the configured hooked pool, subject to delta settlement tests | Recommended research candidate; not selected |
| Uniswap v3 plus a Foundry router | Official Monad addresses and real CHOG/WMON pools | Router can charge only its own routes; direct pool swaps bypass that router | Insufficient for mandatory per-swap fees in the official pool |
| V3 LP ownership and later fee collection | LP fees accrue to positions | Collection-time NFT ownership would misassign historical fees | Does not satisfy transaction-time studio credit without additional accounting |
| PancakeSwap Infinity | Official address table currently lists other networks, without Monad | Hook mechanisms would need a verified Monad deployment first | Not established as a Monad candidate |
| Custom Foundry AMM | No implementation or deployment | Can embed credit on every pool swap | More contract surface and audit work; retain as alternative |

V3 conclusions are engineering inferences from its [public swap and position accounting source](https://github.com/Uniswap/v3-core/blob/main/contracts/UniswapV3Pool.sol). A frontend/router cannot force other callers to pay an extra router fee. Changing the NFT owner at LP fee collection time would violate the existing product rule.

PancakeSwap's [official Infinity deployment table](https://github.com/pancakeswap/pancake-developer/blob/master/docs/pages/contracts/infinity/resources/addresses.mdx) does not list Monad. A Monad Universal Router entry does not establish an Infinity PoolManager deployment.

## V4 proposal and its limits

A PoolKey includes both currencies, fee, tick spacing and hook address. PoolManager dispatches swap hooks inside pool execution and accounts their returned balance deltas. These properties suggest route-independent capture in a configured Foundry pool. They do not prove our hook works. See [PoolKey](https://github.com/Uniswap/v4-core/blob/v4.0.0/src/types/PoolKey.sol), [PoolManager](https://github.com/Uniswap/v4-core/blob/v4.0.0/src/PoolManager.sol) and [Hooks](https://github.com/Uniswap/v4-core/blob/v4.0.0/src/libraries/Hooks.sol).

Proposed sequence, pending implementation and validation:

1. Launch records the NFT studio identity, original creator and immutable token configuration.
2. Curve trades collect disclosed fees and immediately credit separate creator, current NFT owner and treasury beneficiaries.
3. Graduation moves only eligible curve reserves and token inventory into the approved TOKEN/CHOG pool. Existing beneficiary debts stay in the fee vault.
4. A hook identifies a registered pool and accrues funded fees in the swap transaction. It resolves the NFT owner immediately before studio credit, with no user-selected beneficiary in hookData.
5. Claims debit the credited beneficiary, independently of current NFT ownership. LP principal custody is separate from fee claims.

The hook must accept callbacks only from the verified PoolManager, bind the full PoolKey to its launch, validate its address permission bits and prevent unregistered initialization. It must not expose arbitrary calls or initiate swaps through itself: upstream Hooks intentionally skips callbacks for self-initiated actions. A router-only fee or hookData-supplied owner would not meet the requirement.

The hook applies only to pools containing its address. A plain transferable ERC-20 allows anyone to fund another pool without that hook. We must explicitly choose whether studio fees apply to Foundry's curve and official graduated pool, or require additional token transfer restrictions. The latter changes token behavior and is not approved. No global fee guarantee is justified today.

## Quote-side fee accounting

If all three fee components are collected in CHOG, the hook cannot assume CHOG is currency0 or use only afterSwap. Currency ordering depends on token addresses; V4 distinguishes the specified and unspecified swap sides.

| Swap mode | Specified side | CHOG fee design implication |
| --- | --- | --- |
| Buy, exact input | CHOG input | Evaluate beforeSwap specified delta |
| Buy, exact output | TOKEN output | Evaluate afterSwap unspecified delta on CHOG input |
| Sell, exact input | TOKEN input | Evaluate afterSwap unspecified delta on CHOG output |
| Sell, exact output | CHOG output | Evaluate beforeSwap specified delta and user net-output semantics |

This table is a design checklist, not tested fee math. Partial fills, price limits, zero rounding and exact-output gross/net amounts require explicit specification. Settlement must prove that each credit is backed by assets actually received, with liabilities isolated from reserves and LP principal. Failed settlement must revert swap and credit together. No configured rates exist.

A dynamic LP fee alone does not split money into creator/studio/platform credits. The interface must disclose total user costs, including LP fees and any enabled AMM protocol share, alongside Foundry fees. Rates with different bases must not be presented as a simple sum without explaining the calculation.

## Graduation and liquidity gates

Before implementing an adapter, define the graduation trigger, the final curve trade, reserved token/quote inventory, initial AMM price, fees and leftovers. Initialization and liquidity funding must be atomic, with failure restoring the pre-graduation state. Existing pool initialization, concurrent trades, donations and dust cannot change accounting silently.

The NFT owner must not control withdrawal of LP principal. Choose an immutable lock or a separately governed custody policy before deployment. V4 positions, claims, range choice and any fee collection rights require their own review; position ownership is not synonymous with studio fee ownership.

Curve candidates remain open: a linear inventory curve needs exact integer integral/rounding rules; a virtual-reserve constant-product curve needs real reserve backing and sell solvency checks. Neither is selected or simulated with fabricated application data.

## Completion criteria for the next proof

- Obtain and verify CHOG implementation source; inspect all delegation/admin/transfer/mint/upgrade paths. Validate actual balance changes in a real-state fork.
- Establish the deployed V4 source/version match and compatible core/periphery versions.
- Implement a parameterized fee vault and hook without assuming approved product rates.
- On a real-state fork, use the actual Chog NFT, CHOG and PoolManager. Local fork impersonation is test-only; never impersonate against a live network or label it a real owner signature.
- Exercise direct pool, alternative router and official router routes; both token orderings; exact input/output or explicitly reject unsupported modes.
- Demonstrate fee credit at swap time, A→B and A→B→A transfers, old-owner claims and immutable creator rights.
- Test hook self-call exclusion, invalid hookData, settlement rollback, reserve/liability separation and LP withdrawal restrictions.
- Keep deployments and financial actions disabled until the applicable decisions and deployment authorization are supplied.

No mainnet write or real funds were used for this research. No hook, graduated pool or successful fee-capture experiment exists yet.
