# Nguồn và xác minh — 09/10/2026 (Asia/Bangkok)

Mọi số liệu ứng dụng đọc qua RPC thật. Không cache snapshot bên dưới làm dữ liệu ứng dụng; đây là ghi nhận kiểm chứng theo thời điểm.

## Network

- [Monad Network Information](https://docs.monad.xyz/developer-essentials/network-information) và [Current Facts](https://docs.monad.xyz/ai/current-facts) công bố mainnet chain ID **143**, currency **MON**, RPC **https://rpc.monad.xyz**.
- Đã đọc bản [Markdown chính thức](https://docs.monad.xyz/developer-essentials/network-information.md) để lấy các ô bảng extractor HTML bỏ sót; không dựa trên mirror.
- RPC eth_chainId trả **143**. Block ví dụ lúc kiểm tra ban đầu: **111692861**, hash `0x44ab5a8953449dec0f614e30ea0f7337e5bd0b5e14ef4282b259c97f04a94137`. Live integration sau đó đọc block **111694480**. Không sử dụng block này làm latest cố định.

## $CHOG

- Website chính thức [chog.xyz](https://www.chog.xyz/) công bố address **0x350035555E10d9AfAF1566AaebfCeD5BA6C27777**.
- Đọc RPC tại block 111692861: name **Chog**, symbol **CHOG**, decimals **18**, totalSupply raw **1000000000000000000000000000** (1 tỷ với 18 decimals).
- Runtime bytecode dài **45 bytes**, dạng minimal proxy. Đã xác nhận có code và ERC-20 metadata, **chưa** rà soát implementation/admin/transfer restrictions/tax/rebase. Không coi tên/symbol là bằng chứng settlement an toàn.
- Backend bật đọc metadata/balance, không approve/transfer/trade.

## Chog Genesis NFT

- Đầu mối discovery: [profile chognft](https://linktr.ee/chognft) liên kết [Chog Genesis trên OpenSea](https://opensea.io/collection/chog-genesis). Đây là chuỗi liên kết discovery, không phải thông báo address trực tiếp trên trang chủ Chog.
- Item từ collection trỏ tới [token 1557 trên Monad](https://opensea.io/item/monad/0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763/1557), xác định candidate address **0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763**. Có thể đối chiếu [mint receipt trên explorer](https://monadscan.com/tx/0x730195964d4ec7cfba5b460cad486b5c35356d0edabc3b88506c4547c64bc6d9).
- RPC tại block 111692861: bytecode **17264 bytes**; name **Chog Genesis**, symbol **CHOG**, totalSupply **1969**, supportsInterface **0x80ac58cd = true**.
- ownerOf(1557) lúc kiểm tra: **0x50680590D8d078e946C3C7fF1C653F373DDCB329**. Đây là quan sát lịch sử, **không hardcode owner** trong ứng dụng hoặc test assertion.
- tokenURI(1557): `ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/1049.json`. Token ID và số hiển thị trong metadata có thể khác nhau.
- Đủ bằng chứng cho **read-only lookup**, chưa full contract source/admin/upgrade/custody review. Không suy đoán beneficial owner hay cấp quyền vận hành bằng tên collection.

## Runtime provenance và giới hạn RPC

Mỗi phản hồi API có chainId, blockNumber, blockHash, blockTime, fetchedAt, rpcOrigin/source. Reads ghim block và kiểm tra canonical hash lại; vẫn là latest snapshot, không là finalized auth proof/indexer. RPC custom sai chain bị từ chối. Contract thiếu code/ERC-721 hoặc read thất bại thì không dùng fallback giả.

Thử nghiệm query Transfer **500 block** trên RPC chính thức trả HTTP **413**; **100 block** đọc thành công. API giới hạn ≤100 block và trả range/completeHistory=false. Không gọi cửa sổ này là toàn bộ lịch sử.

## Nguồn kỹ thuật

- [ERC-721](https://eips.ethereum.org/EIPS/eip-721): ownerOf, Transfer và approved operator tách biệt ownership.
- [SIWE](https://eips.ethereum.org/EIPS/eip-4361): nguồn cho bước auth tiếp theo, chưa triển khai.
- [OpenZeppelin ERC-20](https://docs.openzeppelin.com/contracts/5.x/erc20): token implementation, SafeERC20/ReentrancyGuard từ package chính thức.
- [OpenZeppelin Finance](https://docs.openzeppelin.com/contracts/5.x/api/finance): tham khảo vesting; code hiện tại dùng beneficiary/allocation bất biến và không có chuyển quyền sở hữu vesting.
- [ethers providers](https://docs.ethers.org/v6/api/providers/), [React](https://react.dev/learn), [Vite](https://vite.dev/guide/): nguồn triển khai read-only API và web.

## Chogathon và vấn đề mở

Đã đọc [Build with Chog](https://build.chog.xyz/); không thấy thể lệ/scoring/deadline Chogathon 2026 trong trang đọc được. Requirements vẫn là thông tin người dùng cung cấp, chưa tái xác minh chính thức. Chưa chốt curve, AMM, graduation/LP, fee bps, randomness/budget/providers. Không có deployment Foundry hoặc token launch thật để hiển thị dữ liệu launch/fees/treasury.

## Authentication and persistence sources — 2026-10-09

- EIP-4361: https://eips.ethereum.org/EIPS/eip-4361 — message fields and wallet sign-in semantics. Implementation verifies its exact server-issued message rather than accepting client-supplied domain/nonce fields.
- EIP-1271: https://eips.ethereum.org/EIPS/eip-1271 — contract signature verification; not implemented in this increment. EOA-only limitation is explicit.
- Node.js SQLite: https://nodejs.org/docs/latest-v22.x/api/sqlite.html — built-in SQLite API. Local runtime Node 22.15.1 successfully runs DatabaseSync; it emits an experimental warning.

## Market and contract research — 2026-10-09

See research/LAUNCH_FEASIBILITY.md and research/MARKET_SNAPSHOT.json for dated findings and explicit limitations.

- Official Uniswap v4 deployments: https://developers.uniswap.org/docs/protocols/v4/deployments
- Official Uniswap v3 Monad deployments: https://developers.uniswap.org/docs/protocols/v3/deployments/v3-monad-deployments
- Versioned upstream V4 PoolManager and Hooks source: https://github.com/Uniswap/v4-core/tree/v4.0.0/src — reviewed protocol mechanisms; not a deployed-source equivalence certificate.
- V3 pool source: https://github.com/Uniswap/v3-core/blob/main/contracts/UniswapV3Pool.sol — direct swap and LP position accounting.
- ERC-1167: https://eips.ethereum.org/EIPS/eip-1167 — exact proxy runtime decoding.
- NFT explorer source: https://monadscan.com/address/0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763#code — retrieved via HTTPS and decoded as data. ChogMint source was available; not independently recompiled.
- CHOG implementation explorer: https://monadscan.com/address/0x7f64ccFeb3E3Afd7691ea0ef404E947786cefae8#code — verified source was not exposed in the retrieved response. Sourcify returned not verified; onchain metadata IPFS retrieval encountered rate limits/gateway errors/timeouts.
- Official PancakeSwap Infinity addresses: https://github.com/pancakeswap/pancake-developer/blob/master/docs/pages/contracts/infinity/resources/addresses.mdx — no Monad deployment listed at research time; router availability alone is insufficient proof.

All runtime reads came from Monad RPC, pinned to block 111841097 with canonical hash recheck. Existing CHOG/WMON V3 pool observations do not establish a Foundry TOKEN/CHOG pool or fee integration.

## Fee vault verification tooling — 2026-10-09

- OpenZeppelin SafeERC20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20 — wrapper used for transfer/transferFrom. Exact balance checks are additionally implemented; SafeERC20 alone does not exclude taxed/rebasing assets.
- OpenZeppelin ReentrancyGuard: https://docs.openzeppelin.com/contracts/5.x/api/utils — shared guard around all mutating vault operations.
- Official Anvil: https://www.getfoundry.sh/anvil/index.html and https://github.com/foundry-rs/foundry — isolated local fork testing. Official npm Windows binary @foundry-rs/anvil-win32-amd64 version 1.7.1 was used from an ignored tool directory.
- Fork source: actual Monad RPC, finalized block recorded by each test. Local chain ID 31337; source chain ID 143. No mainnet state overrides, transactions or signatures.

## CHOG compatibility sources — 2026-10-09

- ERC-20: https://eips.ethereum.org/EIPS/eip-20 — transfer, transferFrom, allowance and event expectations. Maximum allowance decrement behavior is observed separately, not prescribed by the standard.
- Actual Monad fork observation: research/CHOG_COMPATIBILITY.json; interpretation in research/CHOG_COMPATIBILITY.md. Fresh test output is ignored under contracts/artifacts/, never application fallback.
- Bytecode-linked compiler metadata retrieval retried via public Filebase, Lighthouse and 4everland gateways. Two attempts timed out; Lighthouse returned HTTP 402. No verified implementation source was recovered.

## NFT discovery - 2026-10-09

The explorer-published ChogMint source exposes tokensOfOwner(address): https://monadscan.com/address/0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763#code. Direct finalized RPC observation at block 111849306 returned 73 IDs for the dynamically read owner of token 1557. The live integration check repeated getter/balance and sampled ownerOf comparison at its own recorded block. This is collection-specific discovery, not ERC-721 Enumerable or administrative authorization. Owners and IDs are never hardcoded as application data.

## External launch flows reviewed - 2026-10-09

- Pump official program documentation: https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md - separate create/buy instructions, virtual reserve pricing, and migration. Configuration snippets are examples, not independently read current state.
- Pump official curve description: https://pump.fun/docs/bonding-curve - current documented creator/protocol fee and graduation behavior.
- NadFun V2 official integration documentation: https://github.com/Naddotfun/nadfun-v2-intergration/blob/main/BONDING_CURVE_INTEGRATION.md and ROUTER_INTEGRATION.md - optional initial buy during create, creator fees, virtual constant-product reserves and sniping-penalty exception for initial buy. Documentation evidence only; not independent bytecode verification or approval to integrate its contracts. No assumption of CHOG pair/studio fee support.

## V4 settlement interfaces reviewed - 2026-10-09

- https://raw.githubusercontent.com/Uniswap/v4-core/v4.0.0/src/interfaces/IPoolManager.sol - initialize, unlock callback, modifyLiquidity, swap, sync/settle/take semantics.
- https://raw.githubusercontent.com/Uniswap/v4-core/v4.0.0/src/types/BalanceDelta.sol - signed packed 128-bit currency deltas.
- https://raw.githubusercontent.com/Uniswap/v4-core/v4.0.0/src/libraries/TickMath.sol - full-range tick/sqrt-price bounds.

StudioV4LiquidityLock declares an ABI-compatible subset without vendoring upstream implementation. Fork verification uses officially documented Monad PoolManager/StateView, checks actual bytecode/state and settles against real contracts. This is behavior evidence, not full deployed-source equivalence or audit.

## V4 hook source review - 2026-10-09

- https://raw.githubusercontent.com/Uniswap/v4-core/v4.0.0/src/interfaces/IHooks.sol - callback ABI and specified/unspecified currency return deltas.
- https://raw.githubusercontent.com/Uniswap/v4-core/v4.0.0/src/libraries/Hooks.sol - permission-bit validation, before/after swap accounting, and hook-self-call exclusions.
- https://raw.githubusercontent.com/Uniswap/v4-core/v4.0.0/src/PoolManager.sol - hook delta accounting and actual take/settlement.

Real fork reports record actual official Monad PoolManager code hash, CREATE2 hook address, key and block. Source review plus behavior is not an audit or certificate that every routing path is supported.


## Actual market event data - 2026-10-09

Event schemas are read from current StudioCurveMarket/StudioToken/StudioV4LiquidityLock source and the previously reviewed official v4 PoolManager Swap ABI. The backend consumes actual RPC logs from bound protocol addresses; it does not read research snapshots. Fork source block 111866063 validated curve trade prices/volumes and holder balances; hooked source block 111866161 validated official PoolManager feed and price-limited settlement. These local fork writes are not public deployments or wallet authorization. Post-graduation constructor fee inputs remain evidence scales only.


## Persistent market index verification - 2026-10-09

Uses current factory TokenLaunched, ERC-20 Transfer, curve Traded and officially reviewed v4 Swap schemas; actual RPC data only. Real-state fork suites at source blocks 111871137 and 111871268 verify SQLite persistence, canonical branch rollback, multi-window history, actual HTTP SSE and curve-to-pool indexed history. Fork mode reads local latest blocks because Anvil's finalized tag remains at the original source anchor; responses explicitly label local-fork-latest. Runtime uses Monad finalized reads and has no fork address/data fallback. Source/admin/security review remains independent of event-index behavior.


## Supabase primary storage references - 2026-10-09

- https://supabase.com/docs/guides/database/connecting-to-postgres - project-supplied direct/session pooler connections; actual host/password must come from the intended project's Connect panel.
- https://node-postgres.com/features/transactions - one checked-out client per transaction, rollback and release.
- https://node-postgres.com/features/ssl - explicit TLS options and connection-string SSL-option interactions.
- https://supabase.com/docs/guides/getting-started/api-keys - API keys differ from PostgreSQL connection credentials; secrets never belong in browser configuration.
- https://pglite.dev/docs/ - real PostgreSQL WASM engine used only for migration/repository validation, not production storage or proof of a hosted Supabase connection.

Local SQL validation and actual Monad fork event persistence are implementation evidence. No hosted Supabase connection/migration is claimed without real configuration and a successful db:check.


## Frontend market verification - 2026-10-10

The frontend reads the existing indexed history/SSE API and current source event normalization; no third-party price feed or fork report is used as application data. Source block 112077318 anchors isolated real-state fork writes. Browser verification reads an actual test-owned MarketIndexer HTTP API without request interception and observes real branch rollback. Images under ignored contracts/artifacts are test evidence only; no Mainnet deployment or owner-wallet signature is claimed.


## Trade preparation verification - 2026-10-10

Quote/account ABI follows current StudioCurveMarket getBuyQuote/getSellQuote/configuration getters, StudioFeeVault credits/treasury, ERC-20 balance/allowance and Chog ownerOf. Source fork blocks 112079109 and 112079219 verify actual contract outputs, old-beneficiary credits after NFT transfer and graduated quote refusal. Browser checks consume the real test-owned fork reader HTTP API. These are isolated behavior checks, not reviewed deployment economics, signatures or audit claims.
