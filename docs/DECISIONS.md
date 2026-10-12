# Quyết định và vấn đề mở

Cập nhật 09/10/2026. PRODUCT.md là baseline. Các mức phí/tham số fixture chỉ phục vụ kiểm thử.

## Đã chốt bởi người dùng

| ID | Quyết định |
|---|---|
| D01 | Chog Foundry, Monad, tagline trong PRODUCT |
| D02 | Studio theo NFT collection/token ID; nhiều token/studio; NFT không bị bắt custody |
| D03 | Chỉ owner hiện tại launch/quản trị; người khác vẫn trade/tham gia club |
| D04 | $CHOG là quote/pair mục tiêu; curve → pool TOKEN/$CHOG |
| D05 | Creator độc lập với studio owner; credit cũ không chuyển theo NFT |
| D06 | Phiên/moderator cũ hết quyền sau transfer, kể cả transfer quay về |
| D07 | Club offchain, ký ví, không bắt mua token; agent không có quyền tài chính |
| D08 | Treasury chỉ dùng platform fee thực thu, raffle miễn phí/verifiable randomness |
| D09 | Ưu tiên technical spikes trước UI; không mainnet/tiền thật khi chưa được chỉ dẫn |

## Đề xuất kiến trúc — chưa duyệt làm stack sản phẩm

| ID | Đề xuất | Điều kiện đánh giá |
|---|---|---|
| P01 | Solidity; factory mẫu fixed-supply + vesting, fee escrow pull-claim | Kiểm thử EVM, rà soát quyền, accounting và gas |
| P02 | Credit studio fee cùng transaction với trade, đọc ownerOf ngay khi ghi có | Phải chứng minh trước/sau graduation và trường hợp bypass |
| P03 | Transfer epoch từ indexer; owner check mới cho mỗi mutation, fail closed khi index chưa bắt kịp | Event replay/reorg/A→B→A/custody |
| P04 | Web TypeScript/React, API, PostgreSQL, realtime adapter, read-only agent | Chọn sau spike; chưa cài framework/UI/provider |
| P05 | Multisig + ngân sách và max price công khai cho buyback | Tách hoàn toàn reserve/liquidity/user liability |
| P06 | AMM hook hoặc pool tự triển khai để mọi swap ghi fee đúng owner | Khả năng deploy trên Monad, hook/pool permission, routing bypass, LP fee |

## Lịch sử công cụ spike cục bộ — đã ngừng dùng

Node 22+ với node:test; JavaScript ESM + BigInt cho mô hình domain; solc/ethers/Ganache khóa phiên bản bằng package-lock. Đây là lựa chọn thực thi thử nghiệm của agent, không phải người dùng duyệt stack dapp. Ganache chỉ là EVM in-memory, không mô phỏng đặc tính consensus/gas/finality của Monad. Hợp đồng trong contracts/spikes chưa phải hợp đồng production.

## Cần xác minh / quyết định trước triển khai mạng

| ID | Vấn đề | Trạng thái |
|---|---|---|
| V01 | Chog NFT đúng collection/network/chuẩn/upgrade/custody | Chưa xác minh địa chỉ chính thức |
| V02 | $CHOG address, chain, decimals, transfer behavior/proxy | Website Chog công bố address; chưa xác minh runtime onchain |
| V03 | Fee bps/split/rounding, config immutable hay versioned | Chưa chốt; fixture không là mặc định sản phẩm |
| V04 | Curve, tham số, supply allocation/vesting, slippage/deadline | Chưa chốt; curve rời rạc chỉ là mô hình thử |
| V05 | AMM + graduation + LP custody và phí sau graduation | Chưa chọn; không được tuyên bố đã chứng minh bằng mock |
| V06 | Wallet auth, custody/smart wallet, reorg/finality policy | Chưa chọn provider; cần EIP-1271/SIWE và epoch tests |
| V07 | Randomness + snapshot entrants + claim expiry | Chưa chọn nguồn |
| V08 | Budget/treasury signer/agent/realtime/storage | Chưa chốt |
| V09 | Thể lệ Chogathon chính thức, deadline, IP, criteria | Requirements từ người dùng; chưa đọc được trang chính thức |

## Quy tắc thay đổi

Ghi ngày, nguồn bằng chứng và người quyết định khi chuyển đề xuất sang đã chốt. Không dùng một địa chỉ search được làm runtime config. Thay đổi fee/curve/AMM phải có thử nghiệm và giải thích tác động trước khi đề nghị người dùng quyết định.

## Cập nhật theo chỉ dẫn mới — 09/10/2026

- **D10 (người dùng):** ba workspace contracts/backend/frontend.
- **D11 (người dùng):** dữ liệu thật, không mock. Mock contracts, Ganache, simulated domain/demo đã loại khỏi working tree; có thể khôi phục từ commit f3b8734 nếu cần khảo cứu lịch sử.
- **Thực thi hiện tại của agent:** npm workspaces, Node HTTP + ethers, React/Vite, OpenZeppelin + solc. Không tự chốt curve/AMM/fee/provider dài hạn.
- **V01 cập nhật:** Chog Genesis address tìm từ collection OpenSea được liên kết bởi profile Chog, kiểm tra tên/symbol/ERC-721/owner/URI và bytecode qua Monad RPC. Đủ cho tra cứu read-only; cần tiếp tục rà soát source/admin/upgrades/custody trước cấp quyền quản trị hoặc deploy.
- **V02 cập nhật:** $CHOG official address đã có code, name Chog, symbol CHOG, decimals 18, supply đọc live. Runtime là 45-byte minimal proxy; chưa kết luận behavior/admin an toàn cho settlement.
- Factory/token/vesting source mới đã compile, chưa deployed/chưa behavioral EVM tests. Fee ledger nghiên cứu chưa tích hợp market mới.

## Implementation update — 2026-10-09

- Latest user instruction: application copy and ongoing work use English.
- Implementation choice: built-in Node SQLite for persistent offchain profiles; not a long-term provider decision.
- EOA sign-in uses an exact server-issued EIP-4361-format message, single-use nonce and an HttpOnly cookie. ERC-1271 support is deferred and explicitly unavailable.
- Five-minute sessions anchor at a finalized block. Privileged profile writes check the latest canonical owner and scan all Transfer logs after the anchor, in batches of at most 100 blocks. Any transfer rejects old authority, including A→B→A; orphaned anchors, RPC errors and gaps above 1500 blocks fail closed.
- This bounded-scan implementation replaces neither a persistent transfer indexer nor moderator epochs. No fees/economic parameters were approved by this update.

## Market feasibility research — 2026-10-09

- Added [LAUNCH_FEASIBILITY](research/LAUNCH_FEASIBILITY.md) and the dated [MARKET_SNAPSHOT](research/MARKET_SNAPSHOT.json). Use npm run check:markets for fresh data; snapshots are never application fallback.
- CHOG ERC-1167 implementation resolved onchain. Source/transfer/admin behavior remains unresolved; settlement is not approved by a metadata or bytecode read.
- Uniswap v4 is a proposed research candidate with officially documented Monad addresses and live bytecode. No Foundry hook or graduation is deployed or proven.
- V3 router-only fees cannot enforce credit on direct pool swaps. Collecting LP fees according to NFT ownership at claim time violates historical ownership accounting.
- An official hooked pool does not capture trades in other externally created pools. Product fee scope remains an explicit open decision. No transfer restrictions, AMM or economic rates were selected.
- Reviewed explorer-published ChogMint source and read its current maxSupply, reserveMax, metadata and treasury state. This is not independent recompilation or a full audit.

## Fee vault implementation increment — 2026-10-09

Added StudioFeeVault as an undeployed source implementation, separate from historical research. No fee rates are hardcoded: market/hook producers provide explicit amounts and fund the exact sum. Unique token/launch registration permanently binds the original creator and NFT identity. Studio ownership is resolved immediately before accrual; claims never resolve a new NFT owner.

Implementation choices: immutable registrar/treasury and per-launch curve/graduated recorders; separate category credits; permissionless claimFor paying only the recorded beneficiary; no surplus rescue. These choices remain reviewable and do not approve economic rates, LP custody, AMM or a deployment configuration.

The final registrar must be the approved factory/launch coordinator. Recorders must be verified protocol contracts enforcing trade amounts, pool identity, lifecycle and reserves. Test-only EOA roles are not production configuration. The vault itself cannot certify that money originated from a swap rather than an authorized recorder funding a credit.

Real-state fork tests use actual CHOG and Chog Genesis contracts, disposable local Anvil state and local impersonation. They do not create mock contracts, application seed data or live-network transactions.

## CHOG compatibility increment — 2026-10-09

Actual CHOG fork tests passed for exact transfer balances, transferFrom, finite allowance consumption, revocation, events and failed-transfer rollback. Observed paths are compatible with current vault balance checks. Source/admin verification and settlement approval remain false; sampled behavior cannot certify all paths or future states.

No curve, fees, AMM or token transfer restrictions were selected. Results and their limits are in research/CHOG_COMPATIBILITY.md. The shared Anvil harness remains local-only and never substitutes fork results for application data.

## Wallet discovery and Explore - 2026-10-09

Implementation choice: read the verified Chog Genesis tokensOfOwner(address) getter and balanceOf at the same canonical snapshot. Reject duplicate IDs or a count mismatch. Discovery grants no authority; studio opening reads ownerOf again and writes retain full ownership/session checks. Explore displays only persisted local profiles, preserving original authorship and never presenting the historical save author as current owner. No economic decision changed.

## User-approved launch baseline - 2026-10-09

Authority: the user explicitly accepted all five proposals and the testnet-first demo in the current conversation ("ok toi dong y het nha, hop li do"). This update supersedes older statements that all supply/allocation/vesting/curve fee decisions are undecided. It does not supersede pending verification of curve parameters, AMM or deployment assets.

| ID | Approved decision | Remaining boundary |
|---|---|---|
| D12 | Fixed supply of 1,000,000,000 launch tokens; no additional minting. 20% creator allocation; 80% combined curve and graduation liquidity allocation. | Split of the 80% between curve sales and pool seeding is not decided. |
| D13 | Creator allocation locked for 30 days from launch, then released linearly over the following 180 days. No immediate allocation. Original creator remains beneficiary after NFT transfers. | Implement and test timestamp boundaries and rounding. The schedule ends 210 days after launch. |
| D14 | Curve trading fee totals 100 basis points: creator 30 bps, studio 30 bps, platform 40 bps. | Quote notional, integer rounding and exact-input/output semantics must be specified. LP-inclusive post-graduation total fee remains pending AMM verification. |
| D15 | Design a rising-price bonding curve and prioritize technical verification of Uniswap v4 for graduation into TOKEN/CHOG. | Formula, opening price, graduation threshold and final AMM selection require a calculated proposal and verification; v4 is not a finalized deployment choice. |
| D16 | Creator and current studio owner cannot withdraw graduation LP. Fees cover the Foundry curve and official Foundry pool. | Exact LP lock/custody mechanism remains pending. No fee guarantee on externally created pools. |
| D17 | Proceed toward a clearly labeled testnet-first demo. | Select and disclose actual test assets, contract addresses and deployment configuration. No mainnet deployment, real funds, NFT purchase or real campaign authorization. |

Buyback budget, treasury signers, randomness providers and service providers remain undecided. Approval does not certify CHOG implementation privileges or market compatibility. Existing source contracts are not yet wired to enforce this approved baseline.

## Pending curve proposal - 2026-10-09

See research/CURVE_PROPOSAL.md: proposed 500M curve sales / 300M graduation liquidity / approved 200M creator vesting, linear marginal price from p0 to 5*p0. Exact integral matches ideal pool price when all net reserve is seeded. Split, curve and T are pending user review; normalized algebra is not an AMM integration proof or application data.

## User revision: no creator token allocation - 2026-10-09

D18 supersedes the allocation portions of D12 and all of D13: creator allocation is zero; there is no creator allocation vesting. Creator receives the approved creator fee and may choose an optional paid first purchase. Entire fixed one-billion supply is reserved for curve sales and graduation liquidity; split must be recalculated. Purchased tokens are not a free allocation. Initial purchase amount is user-selected, subject to available supply, quote, fees and transaction safeguards; no amount/cap was approved. Atomic create-and-buy is the intended implementation approach, not yet implemented. Curve/fee integration remains incomplete.

The earlier 500M/300M/200M proposal is withdrawn. No replacement split, formula, graduation threshold or AMM was approved by this revision.

## Launch coordinator implementation - 2026-10-09

Implemented D18 in the factory source: fixed one-billion supply and no creator allocation/vesting inputs; optional exact-CHOG-input initial buy with minimum output/deadline. Factory-created fee vault binds registrar to the factory; registration, token inventory transfer, initialization and buy are atomic. These are implementation choices within the approved flow, not approval of a curve, market address, AMM or LP custody. Existing CreatorVesting is unused standalone source.

## Curve market source integration - 2026-10-09

Added a parameterized linear market with no default split/price/threshold. Implementation choices: cumulative integer reserve potential, fee-on-base-notional, 100-bps total rounded up with creator/studio rounded down and platform receiving remainder, maximum gross CHOG buy budget, and actual-spend refund from factory. These semantics are documented for review; the user has not approved numerical curve/deployment inputs. No sniping penalty, allocation or vesting is introduced.

Source supports actual pre-graduation trading/fee accrual. Full curve inventory remains redeemable because no migration adapter is implemented; graduationReady never claims a pool exists. No AMM, LP custody or post-graduation total fee decision changed.

## V4 integration increment - 2026-10-09

Added optional immutable v4 migration adapter and direct permanently held full-range position source. All seeding uses actual reserves and reserved tokens, not fee debt. LP fee is an explicit constructor argument, not a selected product rate. Full-range/tick-spacing-1 custody and dust retention are reviewable implementation choices; no final AMM/LP/fee configuration was approved. Current hook is zero, so post-graduation studio/creator/platform fee capture remains false. Permissionless incompatible pool preinitialization is a known gate requiring initialization authorization in the future hook.

## Hook fee implementation - 2026-10-09

Implemented pool-bound post-graduation fee capture with immutable configurable category bps, exact-input/output quote delta handling, funded vault credits and authenticated official initialization. Actual fork verification confirms NFT-owner-at-accrual and historical claims. Numerical post-graduation fee rates/LP-inclusive total are still not approved; fork constructor 30/30/40 bps and LP fee 3000 are evidence inputs only. No external-pool fee guarantee or Universal Router integration is claimed. Quote-specified partial fills reject atomically; LP fees remain in locked position.


## Price bounds and market data implementation - 2026-10-09

Implementation choices: optional Q96 swap price limits with atomic underfill/fee safeguards; bounded finalized market data from verified factory bindings; OHLC based on CHOG execution notional; conditional mint-to-snapshot holder replay; no synthetic empty candles. These do not approve deployment economics, LP fees, public deployment, an indexer provider or a realtime transport. Protocol contracts are included/labeled in holder counts; callback routers are not inferred trader identities.


## Durable market index and SSE - 2026-10-09

Implementation choices within the real-data request: a separate local SQLite market database, canonical finalized chunk checkpoints, factory-event launch discovery, transfer-log holder replay and SSE authoritative replacement snapshots. Three-second polling, 100-block RPC batches and explicit local capacity budgets are operational settings, not approved token economics or service-provider decisions. Deployment address and exact first-code block remain empty until an actual deployment is reviewed. No financial authorization changed. This index grants no studio/moderator privileges.


## D19: Supabase primary database - 2026-10-09

User explicitly chose Supabase as the primary DB. This supersedes the proposed SQLite-primary mirror option. Studio profiles/revisions and durable market indexes/checkpoints/event windows move to backend-only Supabase PostgreSQL. Existing SQLite files are preserved for one-time import/local tests; runtime has no fallback or dual write. Implementation: pg driver, async repositories, PostgreSQL transactions, verified TLS and a private RLS-enabled foundry schema. Hosted project connection remains unconfigured. Authentication sessions remain in RAM; no new financial/economic authority is granted.


## Bound-pool v4 quoter implementation - 2026-10-10

Implementation choice: a pool-bound revert-based exact-input quoter observes actual PoolManager deltas and funded vault counters, then rolls back the swap. Backend requires a verified quoter address and validates immutable deployment bindings. No new post-graduation rate, AMM deployment, LP policy, financial execution or Mainnet authorization is approved. LP fee units are observed configuration; measured CHOG protocol fees and LP rate remain separate disclosures.

## Read-only settlement inspection - 2026-10-10

Implementation choice: exact-input curve/v4 unsigned calldata inspection with user-specified minimum output and future deadline, actual-wallet eth_call and same-block gas estimation. A one-hour maximum deadline is an API bound, not approved token economics. Missing funding/allowance blocks settlement without overrides. No approval/trade signing, public deployment or Mainnet execution is enabled.

## Approval and claim inspection - 2026-10-11

Implementation choice: exact allowance plans with explicit reset/confirmed-refresh sequencing, plus claim simulation for the recorded beneficiary without current NFT ownership checks. Existing sufficient allowance is preserved; later approval steps are not simulated against assumed state. Claims remain vault-wide aggregate credits, not per-token earnings. No economic or financial execution approval changed.

## Event-based trade identities - 2026-10-12

Implementation choice: use bound lock settlement events to identify literal payer/recipient for uniquely matched official v4 trades. Unknown external/ambiguous routes stay null; no beneficial-owner or transaction-sender inference. Identity evidence persists in existing PostgreSQL JSON event windows and follows canonical rollback. No economics, signing, deployment or authority decision changed.
