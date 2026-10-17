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


## Reverting v4 quote review - 2026-10-10

- https://github.com/Uniswap/v4-periphery/blob/main/src/lens/V4Quoter.sol - reviewed non-view eth_call simulation through unlock and a deliberate quote revert.
- https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/QuoterRevert.sol - typed quote error discrimination versus unexpected simulation failures.

Foundry does not vendor or claim equivalence to these contracts. Its source observes actual bound-pool deltas and funded vault counters in a fixed-length report. Browser fork source block 112110775 and full-suite hooked source block 112111203 validate execution comparison/rollback against actual official Monad PoolManager. LP test units 3000 and hook 30/30/40 bps are evidence inputs, not approved post-graduation economics.

## Settlement JSON-RPC semantics - 2026-10-10

- https://ethereum.org/developers/docs/apis/json-rpc/#eth_call - read-only call sender/calldata and explicit block selection.
- https://ethereum.github.io/execution-apis/api/methods/eth_estimateGas - estimation request includes block number/tag.

Implementation runs current Foundry source methods; actual same-block estimation support is verified separately on isolated Anvil, not inferred for every Monad RPC provider. Runtime rejects unsupported estimation rather than silently using latest state.

## Approval/claim semantics - 2026-10-11

- https://eips.ethereum.org/EIPS/eip-20#approve - reviewed allowance replacement, false-return handling and UI reset-to-zero guidance.
- Current contracts/src/StudioFeeVault.sol - claim/claimFor pay recorded credits, clear the entire beneficiary credit and verify exact outgoing balance deltas without consulting ownerOf.

Prepared calls use existing verified deployment/quote binding checks and canonical JSON-RPC simulation. Local fork impersonation is not an owner-wallet signature; claim preparation source review does not establish a public deployment or audit.

## Foundry settlement event attribution - 2026-10-12

Source: current contracts/src/StudioV4LiquidityLock.sol PoolTrade emission after successful settlement/refund, and the previously reviewed official PoolManager Swap ABI. Runtime reads actual logs from the factory-bound lock and pool; it never consumes this report as data. Literal payer/recipient are event identities, not wallet ownership or beneficial-owner claims.

Hooked fork source block 112803694 verifies actual receipt evidence, independent-route refusal and PostgreSQL canonical rollback. No external-router decoder, public deployment or audit is claimed.

## Wallet indexed history - 2026-10-13

Uses current StudioToken Transfer, curve Traded and matched official lock PoolTrade/PoolManager Swap events from actual RPC-indexed windows. Existing complete mint/supply conservation checks remain prerequisites for wallet balance replay. No exchange price feed, synthetic wallet data, inferred trader or research snapshot is used. Scope is the selected token's canonical checkpoint, not a verified complete economic history or authenticated wallet profile.

## Factory wallet portfolio - 2026-10-13

Uses the existing canonical factory launch/index, complete mint/Transfer replay and evidence-attributed curve/v4 trades. PostgreSQL transaction isolation follows the already reviewed PostgresDatabase read-only repeatable-read implementation; source contracts/economic settings are unchanged. Portfolio balances are quantities through a checkpoint, not profit, price or ownership authority. No external valuation feed or fabricated fallback is used.

## Actual factory launch preparation - 2026-10-14

ABI and semantics follow current contracts/src/StudioTokenFactory.sol launch(LaunchParams), TOKEN_SUPPLY, ownerOf checks, exact quote funding/refund and TokenLaunched event. Standard eth_call/eth_estimateGas semantics were previously reviewed. The factory returns only an address; simulation is not a receipt or new token deployment. No newly inferred addresses or reserve-model quotes are used.

Isolated real-state curve fork source block 113289062 verifies creation/first-buy rollback, prepared calldata execution/address comparison, actual approved-operator refusal, old-owner refusal after NFT transfer, funding/allowance blocks and browser form cancellation. Budget-block tests read the actual wallet balance/allowance rather than assuming pre-existing balances are zero.

## Canonical launch receipt evidence - 2026-10-15

Uses current StudioTokenFactory launch calldata/TokenLaunched, StudioCurveMarket Traded, StudioFeeVault FeesCredited and actual CHOG/StudioToken Transfer logs. Historical getters use the canonical receipt block; current NFT owner is not a substitute for historical creator/accrual evidence. Standard JSON-RPC receipt/transaction/block reads are the source, not fork reports or simulated addresses.

Actual isolated fork source block 113622701 verifies paid/no-buy/refunded launches, direct prepared calldata, post-transfer historical owner identity, wrong-contract/NFT/reverted/unfinalized rejection and orphaned receipt removal after evm_revert. This is disposable fork execution evidence, not an owner-wallet signature or public deployment.


## Mainnet direction and wallet transport — 2026-10-16

Official Monad Mainnet network documentation and Uniswap v4 deployment table were rechecked. The official Monad PoolManager remains 0x188d586ddcf52439676ca21a244753fa19f9ea8e; source: https://developers.uniswap.org/docs/protocols/v4/deployments (Monad143 section). Official CHOG site remains https://www.chog.xyz/. No external requirement that these assets universally do not exist on testnet was established; Mainnet selection is the user's explicit instruction.

Approved economics and treasury policy are user decisions (D20/D21), not source-inferred market facts. The unsigned deployment planner uses current compiled source, exact approved integers and actual RPC nonce/code/block evidence, with no research-state/runtime fallback. Nonce predictions require an unchanged latest/pending sender nonce; dependent deployment gas stays unavailable until preceding contracts exist. Browser transport uses EIP-1193 wallet requests and the previously reviewed JSON-RPC call/estimate/receipt semantics. It never holds keys, signs automatically or submits from the backend.

Actual curve/factory fork source block 113867666 verifies factory reset/exact approval, fresh-review refusal, wrong-network refusal and actual wallet-transport approval/buy against CHOG. It also passes Chromium desktop/mobile existing launch/receipt/chart/history/reorg checks. The transport test uses a real local unlocked signer for transaction population, forwarding actual chain reads without RPC stubs. Local fork receipt observations may remain confirming because its finalized tag does not advance like public Mainnet; no fabricated finality or human-owner signature is claimed.


Approved-economics integration source block 113868003: current compiled six-step deployment plan, actual CHOG/NFT, official v4 PoolManager and real quoter/lock/fee-vault events. Verified exact 1.5M-CHOG reserve and 375M-token graduation plus post-transfer historical claims. Funding came from observed existing PoolManager CHOG balance, solely via local fork impersonation; no real network funds moved and no storage fabricated. This source does not imply permission to withdraw existing Mainnet liquidity.


## RainbowKit integration references — 2026-10-16

Official installation https://rainbowkit.com/en-US/docs/installation (provider nesting, wagmi/viem/TanStack peers and WalletConnect Project ID); wallet list https://rainbowkit.com/en-US/docs/custom-wallet-list; official injectedWallet/connectorsForWallets source https://github.com/rainbow-me/rainbowkit/tree/main/packages/rainbowkit/src/wallets. Installed npm peer metadata requires wagmi ^2.9.0, so integration intentionally pins compatible wagmi2 instead of unrelated latest v3 APIs. Missing-ID browser-only setup supplies no dummy cloud ID; injectedWallet does not use a WalletConnect service.


## Chogathon visual reference and routing — 2026-10-17

User supplied https://chogathon.chog.xyz/dashboard as the visual reference. Read-only browser screenshot and rendered DOM computed styles observed --bg #0e0b1a, --card/#surface #161228, --p/#accent #836ef9 and --tx #f4f1fe. Only presentation colors were used; account/submission/entrant/countdown data were not copied into Foundry. Generic Monad landing reference https://monad.xyz/ was also read.

React Router official declarative routing reference: https://reactrouter.com/start/declarative/routing (nested layout/Outlet, dynamic segments, Link/NavLink and index redirects). Installed compatible v7 package is locked by npm. No routing or navigation grants NFT ownership, wallet authentication or transaction authority.


## Claude, X engagement and Pyth Entropy - 2026-10-17

User selected Claude and https://x.com/ChogNFT with follow/like/reply/repost point earning. Provider/API integration uses primary references only:

- Claude Messages API: https://platform.claude.com/docs/en/api/messages/create and authentication https://platform.claude.com/docs/en/manage-claude/authentication. Backend calls the official messages endpoint with a server-only key and explicit model; no live model request was claimed without credentials.
- X OAuth 2 PKCE/scopes/callback: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code. Read-only follows https://docs.x.com/x-api/users/get-following, user likes https://docs.x.com/x-api/users/get-liked-posts, reposting users https://docs.x.com/x-api/posts/get-reposted-by. Direct reply inspection uses actual post author/referenced_tweets, not a browser-intent success assumption. Actual API access/quota remains unverified without the intended app.
- Pyth Entropy chainlist https://docs.pyth.network/entropy/chainlist: rendered official Monad row linked https://monadvision.com/address/0xd458261e832415cfd3bae5e416fdf3230ce6f134 and the documented provider 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506. Read-only Mainnet block 114206651/hash 0x5f51fa50aaae0711837ef217b287eeb1568257e32999eb8d44cb214c646c91a8 verified deployed code, getDefaultProvider and getFeeV2. The observed fee was evidence at that block, not a fixed default or spending approval.
- Request/callback ABI: https://docs.pyth.network/entropy/generate-random-numbers-evm and official https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/entropy_sdk/solidity/IEntropyV2.sol and IEntropyConsumer.sol. Foundry declares an ABI subset without copying the SDK. Callback entry is _entropyCallback(uint64,address,bytes32), guarded by literal Entropy sender and pinned provider.

Actual disposable-fork source block 114210301 verified NFT escrow/cancellation, frozen-root timing, authenticated callback boundary, an actual request to deployed Pyth and the native-fee wallet transport. No real provider callback or prize award was invented. This is not a public deployment, audit, human-owned wallet signature or real-fund transaction.
