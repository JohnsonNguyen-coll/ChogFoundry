# Kế hoạch triển khai

Ngày 09/10/2026. Mục tiêu đầu: chứng minh NFT transfer làm đổi quyền và studio fee tương lai mà không chuyển nợ cũ/creator. Kiến trúc dưới đây là đề xuất triển khai, không chốt curve/AMM/provider.

## Kiến trúc mục tiêu

```text
Wallet → Web → API (wallet auth + owner/transfer epoch) → DB/realtime club
   └── user-signed tx → Factory/Studio registry → fixed-supply token + vesting
                                      └── Curve market → Graduation adapter → TOKEN/$CHOG pool
                                               └── Fee escrow → beneficiary credits → claims
NFT ownerOf/Transfer → chain reader + reorg-aware indexer → studio/permissions/history
Agent → read-only chain/studio tools → proposal for user review/signature
Treasury (only earned platform fees) → multisig → disclosed buyback/campaign
```

Onchain bảo vệ launch, cấu hình kinh tế và tài sản; API không được thay thế kiểm tra onchain. Studio key kèm chain ID ngoài chain. Creator identity/token config bất biến lúc launch. Fee escrow không được quyền dùng reserve. Nội dung giữ tác giả; owner mới chỉ có quyền quản trị hiện tại.

## Mốc, phụ thuộc và tiêu chí hoàn thành

| Mốc | Công việc | Phụ thuộc | Hoàn thành khi |
|---|---|---|---|
| M0 | Baseline, quyết định, nguồn, scaffold | Kiểm tra repo | Đủ tài liệu, hướng dẫn chạy; chưa ghi đè file cũ |
| M1 | Spike owner + fee escrow; mô hình transfer epochs | M0 | EVM test owner-only registration, recorder-only credit, A→B fee/claim, creator giữ nguyên, solvency, claim replay, tiny-fee rounding; domain test A→B→A |
| M2 | Spike curve + candidate graduation; token template/vesting | M1; fee/supply candidates | Local model buy/sell, slippage/deadline, reserve/inventory bảo toàn; EVM market thật và fixed supply/vesting; test failed graduation rollback |
| M3 | Chọn AMM, chứng minh phí sau graduation | M2; official AMM docs/code/deployments | Swap trực tiếp và qua router đều ghi đúng beneficiary; LP fee đầy đủ; LP policy onchain; NFT transfer đổi fee mới; không bypass. Mock không đủ |
| M4 | Auth/indexer/API/club nền tảng | M1; V01/V06 | SIWE nonce/domain/expiry, EIP-1271; owner mới được quyền; epoch chặn quyền cũ; reorg/catch-up fail closed; attribution giữ nguyên |
| M5 | Web flow Explore/Studio/Launch/Trade/Claim | M2–M4 | Full fee/supply disclosures, simulation vs chain labels, wallet signatures, slippage, receipts/errors; demo A→B chạy được |
| M6 | Agent + club retention | M4–M5; providers | Read-only tools có nguồn/block/time; prompt injection không cấp quyền; proposal/vote/meme credit; creator ký cuối |
| M7 | Treasury/campaign/raffle | M1/M5; budget/randomness | Earned funds độc lập; mock labels; snapshot trước randomness; verify winner/claim; free entry |
| M8 | Monad testnet + submission | V01–V09, M3–M7 | Contract/chain verified; integration tests; user journey/video ≤3 phút; repo/test guide/pre-existing work; feedback thật hoặc ghi chưa có |

## Phạm vi giai đoạn đầu — lịch sử, được thay thế bởi chỉ dẫn bên dưới

1. Dựng workspace Node test runner, contracts/spikes, domain, scripts, tests, config.
2. Viết FeeLedgerSpike và fixture ERC-721/ERC-20, compile + chạy EVM trong memory. Fixture recorder đại diện fee producer; chưa chứng minh fee collection của AMM.
3. Mô hình BigInt curve rời rạc và chuyển custody kế toán lúc graduation. Không chọn đường curve này cho sản phẩm. Snapshot lỗi không mutate state.
4. Test owner epochs, phí chia/rounding, claims và reserves; script demo kỹ thuật A→B. Ghi tiến độ thực tế vào STATUS.md.
5. Khi có dữ kiện AMM chính thức, thử hook/pool trên local fork/testnet trước chốt. Không dựng giao diện trade thật khi đường thu phí sau graduation chưa được chứng minh.

## Invariants và edge cases

- Sum credits = escrow liability; quote balance >= liability; rounding không tạo tiền.
- Curve reserve chỉ là quote dùng redeem; phí đã credit không cộng vào reserve. Không buyback reserve/user debt.
- Creator fee và creator allocation không đổi theo owner NFT; owner mới không rút LP/sửa supply.
- Transfer ordering trong cùng block theo transaction/log index; phí trong trade ghi owner tại execution. Reorg rollback events và derived permissions. Fee accrual trì hoãn theo owner lúc claim là không đạt.
- ownerOf revert/burn/custody: hành vi explicit, fail closed mutation; credit đã có vẫn claim được. ERC-20 không chuẩn/tax/rebase phải bị loại hoặc có adapter chứng minh accounting.
- Reentrancy, failure atomicity, unauthorized fee injection, zero values, overflow/rounding, replay claims, concurrent trade/graduation, slippage/deadline.
- A→B→A không hồi sinh moderator/session cũ. Indexer chưa đồng bộ không được cấp quyền nhờ dữ liệu cache.

## Ranh giới thử nghiệm hiện tại

Solidity spike chỉ thử register launch metadata + fee accounting; chưa factory phát hành ERC-20 thật. Mock NFT không là collection Chog; mock quote không là $CHOG. Mô hình curve/graduation không tạo pool hay lock LP. Transfer epoch model giả định event reader tin cậy, chưa là backend authentication. Không public deployment. Mỗi mốc chỉ đánh dấu xong theo bằng chứng trong STATUS.

## Kế hoạch hiện hành sau tái cấu trúc — 09/10/2026

1. **Đã làm:** ba workspace; API live overview/NFT/wallet/Transfer; frontend read-only; nguồn block/hash/time; contract source fixed supply + immutable creator vesting + owner-only factory.
2. **Đã kiểm tra:** validation/HTTP, live integration đối chiếu độc lập RPC, compile/frontend build, browser desktop/mobile. Không dùng mock.
3. **Tiếp theo:** xác minh bytecode implementation/proxy/admin của $CHOG và source/custody Chog Genesis; lập bảng ứng viên curve/AMM/fee capture từ source chính thức.
4. **Tiếp theo:** hoàn thiện market integration/factory initialization, fee vault và graduation sau khi có lựa chọn kinh tế được duyệt. Contract behavioral tests cần fork dữ liệu thật hoặc môi trường chain phù hợp; không tạo mock fixtures. Không deploy mainnet.
5. **Sau đó:** canonical/reorg-aware indexer, wallet signature auth, transfer epoch và storage, rồi mở quyền studio/club; query latest owner read-only hiện tại không thay auth.
6. Launch/trade/claim/treasury/campaign chỉ bật khi có deployment và dữ liệu thật tương ứng; không dùng số 0 để thay dữ liệu chưa tồn tại.

Docs giữ lịch sử thử nghiệm phía trên để giải thích tiến độ, không yêu cầu chạy lại mock/demo đã bỏ.

## Completed increment — authenticated offchain profiles

Implemented English UI/API copy, EOA wallet signature login, exact-origin writes, persistent SQLite profiles, revision conflicts and author attribution. Profile saves recheck ownerOf and all NFT transfers since the finalized sign-in anchor. Mainnet remains read-only.

Validated with local parser/storage tests and live RPC/signature tests. Real owner-approved writes and an actual NFT round trip remain outstanding; no blockchain writes were authorized for testing. Next dependencies remain real market/fee integration research and durable ownership indexing.

## Read-only market inspection increment — 2026-10-09

Completed a reproducible inspection of CHOG implementation, NFT state, official Uniswap deployments and actual V3 pool identities at a finalized canonical block. The command is npm run check:markets; independent live integration checks cover its bytecode hashes and pool lookup results.

The proposed next contract proof is a pool-bound V4 hook with funded fee credits, immutable original creator and ownerOf at accrual. It must test direct/alternative routers, self-call exclusions, all supported swap modes, settlement failure and NFT transfer/old-owner claims on real-state fork or appropriate testnet. First resolve quote-token source and explicitly define fee scope, curve/graduation parameters and LP custody. This proposal is not an approved architecture.

## Fee accounting increment — 2026-10-09

Implemented and fork-tested StudioFeeVault with actual CHOG and Chog Genesis code/state. It records funded category credits, preserves creator identity, credits current NFT ownership at accrual and permits old-owner claims after transfer. Tested an actual reverted funding transaction, donation isolation and duplicate registration.

This completes an isolated vault accounting proof, not M1/M3 or the full demo: no actual market/hook swap, graduation, factory-vault initialization, claim UI or real owner signature was exercised. Next integrate the vault atomically with the approved launch coordinator and fee producers; test pool routes and settlement only after quote-source and fee-scope review.

## Quote compatibility proof — 2026-10-09

Added actual CHOG behavior checks on a real-state Monad fork and extracted common guarded fork startup/cleanup for reuse. Both fork suites pass. Source retrieval remains unresolved; before production market integration, review implementation privileges/delegation and obtain the outstanding economic decisions.

An actual AMM swap test and transaction-time fee hook proof remain separate gates. ERC-20 transfer compatibility alone does not complete them.

## Discovery increment - 2026-10-09

Completed wallet NFT discovery, selectable token IDs and Explore for up to 50 actual persisted studio profiles. Empty storage and failures have distinct UI states. Live tests independently compare the getter and ownerOf at the recorded wallet block. Next gates remain quote implementation privilege review, approved launch economics, actual market settlement/fee integration, durable transfer indexing and real-owner profile write verification.

## Implementation order after economic baseline approval - 2026-10-09

1. Prepare a calculated curve proposal: exact formula/inverse, quote units, rounding, 80% sales/pool allocation, opening and terminal prices, graduation CHOG threshold, reserve redemption and pool-seeding price continuity. Obtain approval of concrete parameters before freezing the market.
2. Enforce the approved supply/allocation/vesting schedule in the launch coordinator; integrate token creation, vesting, market initialization and fee-vault registration atomically. Existing generic factory arguments do not yet enforce these decisions.
3. Implement buy/sell with the approved curve fee split, funded credits at transaction-time ownerOf, slippage/deadline, reserve isolation and explicit rounding. Prove boundaries and failure atomicity on real-state local fork; no mocked RPC or contracts.
4. Verify an actual v4 swap/settlement path and fee producer with the selected pool identity, LP custody and immutable original creator. Test direct routes, alternative routers, NFT transfer/old claims and unsupported routes. Select final AMM/post-graduation total fees only after evidence.
5. Select and disclose testnet assets/configuration; deploy the integrated flow to testnet and wire launch, trade and claim screens to actual transactions. Verify A launch/trade, A-to-B NFT transfer, B future credits and A historical claims. Fork proofs are not testnet completion.

Completion gates: no market reserves counted as fee liability; pool seeding does not consume creator allocation; creator vesting remains fixed across NFT transfers; no creator/studio-owner LP withdrawal; no mainnet writes. Real-data requirements remain unchanged.

Calculated proposal prepared in research/CURVE_PROPOSAL.md. Verified allocation sum, reserve endpoint and ideal price continuity with exact rational arithmetic. Await approval of split/curve and a verified test-asset/deployment basis for T before freezing market parameters.

## Revision after removal of creator allocation - 2026-10-09

Implement the launch coordinator without creator allocation/vesting inputs. Support optional initial paid purchase with disclosed CHOG input, token output, ownership percentage, fee breakdown, minimum output and deadline. Prefer atomic creation/market initialization/fee registration/first buy; any failed purchase must revert the whole launch. These safeguards are implementation requirements; no numeric first-buy cap or new curve parameters were selected. Existing generic factory/vesting source is not yet updated; do not call it product-complete. Withdraw the previous 500/300/200 proposal and recalculate sales/liquidity allocation before market implementation.

## Launch coordinator source completed - 2026-10-09

Factory now implements creation/fee registration/initialization/optional paid first buy as one transaction. Compile and negative real-state fork checks are separate from a successful market integration gate. Next implement and validate the compatible market against agreed curve parameters; prove initial buy success, exact fees, reserve invariants, zero-buy launches, final-buy graduation and full rollback on buy/settlement failures. No placeholder market or application simulation was introduced.

## Market integration increment - 2026-10-09

Implemented parameterized linear market plus actual-cost first-buy refunds. Real-state fork integration now covers creator-paid initial buy, zero-buy launch, normal buy/sell, transfer to B, new studio credits, immutable creator credits and A claim. Added integer quote comparison, slippage rollback, failed initial-buy launch rollback, inventory cap/refund and donation isolation checks.

Next: approve concrete numerical sale/liquidity/price configuration and fee rounding semantics, add a real v4 migration/settlement adapter with price continuity/LP custody, verify routing/fee capture, then testnet deployment and real UI signing. Request for candles, realtime buys/sells, holders and profiles is retained for after this contract flow, following the user's latest priority.

## V4 migration source increment - 2026-10-09

Implemented atomic curve-to-v4 migration with price-continuity validation, exact currency settlement, permanent position custody, dust reporting and actual LP-fee-only swaps. Verify failed migration leaves the curve redeemable and successful migration closes curve trades.

Next critical gate: build and verify a pool-bound v4 hook with authenticated initialization and funded transaction-time creator/studio/platform fee credits. Test direct/alternative routers, exact input/output, NFT transfer and settlement rollback after graduation. Current hooks=0 adapter does not satisfy this gate; do not deploy it as the complete launchpad. Concrete economics, reviewed custody/dust/LP collection policy, CHOG privilege review and testnet configuration remain pending. Candles/realtime/holders/profile work remains queued after contract flow.

## Hook integration increment - 2026-10-09

Completed real PoolManager callback fee capture for four swap modes and bound-pool initialization authorization. Fork tests cover actual funding, fee-event vs PoolManager quote-delta comparison, NFT transfer, original creator/old claims, independent callback caller and credit rollback with slippage. Hook has no public self-swap/unlock route.

Next: verify quote-specified partial-fill rejection and all intended external router paths more comprehensively; review reentrancy/custody/source privileges, dust/LP fee custody and fixed post-graduation economics; prepare verified testnet assets/configuration and deployment scripts, then UI signing/indexing. No mainnet authorization. Candles/realtime/holders/profile work stays queued after contract flow.


## Market data foundation and price-limit verification - 2026-10-09

Implemented tight-limit partial-fill and settlement rollback verification using the actual hooked pool. Added read-only curve/PoolManager event normalization, exact integer OHLC/volumes, canonical block validation and conditional complete holder replay. Fork suites validate the reader on actual executed trades. API fails explicitly until an actual verified factory is configured.

Next data layer: durable deployment-to-head backfill/checkpoints, canonical rollback/catch-up, holder ledger, SSE/WS resume/deduplication, trader attribution from supported router events, and actual chart/trade/profile UI. Current 100-block windows are a bounded foundation, not a production indexer or realtime feed. Preserve the pending contract source/router/security review and concrete testnet asset/economic configuration gates.


## Persistent market history and realtime API - 2026-10-09

Implemented contiguous launch-to-head backfill, transactional SQLite event/checkpoint persistence, restart resume, deployment identity/anchor validation, canonical rollback and recomputed candles/holder balances. Added indexed token discovery, history, status and SSE endpoints. Reconnect receives a fresh authoritative snapshot; reorg emits reset; RPC failures close streams with unavailable. Fork tests exercise actual branch replacement, multi-window history, SQLite reopen and real HTTP SSE. Authentication transfer invalidation remains independent.

Next: connect a real-data frontend chart/trade/holder view, add supported-router trader attribution and indexed pagination/aggregates, then load-test the local capacity boundaries. Public financial flow still requires reviewed economics/assets/deployment configuration and outstanding contract review. No runtime factory is configured, no fork data is application fallback and no mainnet deployment is authorized.


## Supabase primary repositories - 2026-10-09

Implemented D19 PostgreSQL schema/repositories and async API/indexer/SSE calls. Prepared idempotent schema migration, safe connection check and one-time SQLite import with consistent backups/empty-target guard/atomic writes. Existing local files are preserved. SQL is tested with a real PostgreSQL WASM engine and actual fork events; production Supabase TLS/network/pooler validation is not complete without the actual connection string.

Next prerequisite: configure backend/.env SUPABASE_DATABASE_URL from the intended Supabase project's Connect panel, run db:migrate and db:check, then optionally import existing SQLite data with all writers stopped. Do not log or request credentials in chat. Continue pending frontend chart/trade/holder work; Supabase selection does not authorize public blockchain deployment or real funds. Sessions and single active index-worker limitations remain.


## Market frontend implementation - 2026-10-10

Completed read-only indexed market discovery, exact-price candles, realtime replacement snapshots/reorg reset, buy/sell history, holder roles and canonical provenance. Actual-fork browser verification covers populated data and branch replacement on desktop/mobile; runtime missing-configuration behavior stays explicit.

Next prerequisites: configure the actual Supabase project and validate migration/connectivity; review/select testnet assets and numerical deployment economics before any public contract deployment. Then implement user-reviewed wallet transaction preparation/signing, quotes/approval/deadlines/slippage, positions and fee claims against the verified deployment. Preserve read-only Mainnet policy. Extend supported-router trader attribution, paginated history and operational capacity validation independently. No decisions on economics or public deployment are implied by the UI implementation.


## Trade preparation increment - 2026-10-10

Completed finalized read-only curve quote and account inspection: exact amounts, category fees, actual spend/unused budget, balances/allowances and beneficiary credits. Public wallet inspection grants no authority. Real curve/hooked fork checks and Chromium exercise source getters and reject graduated curve quotes.

Next: finalize reviewed testnet deployment assets/economic configuration and configure Supabase. Implement a genuine v4 quote/preflight path, explicit slippage/deadline, gas/allowance transaction review and wallet signing with chain/account rechecks. Claims must follow recorded beneficiaries. No Mainnet execution is authorized; inspection alone does not enable transaction submission.


## V4 quote increment - 2026-10-10

Implemented StudioV4Quoter source, configured readTradeQuote dispatch and graduated quote display. Actual swap/hook effects revert before settlement; response distinguishes protocol fees, LP rate, actual/unused input and maximum approval/funding basis. No reserve-model or state-override quote fallback.

Next: reviewed deployment/assets/economics and Supabase connection, then explicit slippage/deadline, settlement/gas preflight and wallet-reviewed approval/trade/claim signing. The current quote is not a complete transaction simulation. Broader router/security review and partial-fill UI/preflight coverage remain. No Mainnet financial execution is authorized.

## Settlement preparation increment - 2026-10-10

Added read-only actual-wallet preflight for curve and bound v4 exact-input trades, explicit minimum output/deadline, same-block gas estimation and unsigned calldata review. Frontend protections have no preset economic values and stale results are discarded.

Next: configure actual Supabase and review/select testnet assets/deployment economics; add reviewed approval/trade/claim signing only against that verified deployment with immediate account/chain/state rechecks and receipt handling. ERC-1271 and broader router/security review remain outstanding. No Mainnet financial execution is authorized.

## Fee action preparation increment - 2026-10-11

Completed unsigned exact approval/reset plans and recorded-beneficiary claim inspection with actual contract calls and same-block gas estimation. Claims have no ownerOf dependency and cannot redirect assets. Frontend displays steps, credits, gas and canonical transaction source. Tests execute prepared calldata only in isolated child-owned real-state forks.

Next prerequisites for public signing remain actual verified testnet deployment/assets/economic parameters and Supabase configuration. Future signing must refresh after each approval receipt, recheck chain/account/spender/state and preserve recorded claim beneficiaries. Broader security review and router support remain outstanding. Mainnet/runtime broadcasts remain disabled.

## Official trade identity increment - 2026-10-12

Completed canonical official-lock settlement correlation, persisted event evidence/actual settlement amounts, explicit unresolved/legacy counts and frontend payer/recipient display. Verified real routed trades, distinct recipients and PostgreSQL reorg rollback; existing curve identities and candle notional remain intact.

Next: reviewed Supabase/deployment configuration for an actual testnet demo and wallet signing; external/multi-hop/batch router attribution and user portfolio/position summaries still require explicit evidence and completeness limits. No Mainnet financial execution or inferred wallet identity is enabled. Previously indexed windows are preserved and require a separately reviewed rescan for enrichment.

## Wallet activity increment - 2026-10-13

Added token-specific wallet-history API and UI using complete indexed replay, independent of the top-holder/recent-trade displays. Includes explicit role/history/truncation/catch-up/provenance limits, and stale-request cancellation. PostgreSQL remains primary; no schema/data migrations or runtime fork fallback.

Next: configure actual Supabase and reviewed testnet deployment before signing; broader multi-token portfolio, paginated history, external-router attribution and defensible cost basis remain outstanding. PnL stays unavailable and indexed public wallet data never grants studio permissions.

## Factory portfolio increment - 2026-10-13

Implemented factory-wide wallet portfolio API/dashboard with one canonical PostgreSQL snapshot, per-token holdings/activity, historical zero positions, unresolved-route/catch-up/capacity indicators and links into market detail. Existing index data is read without schema migrations or backfill.

Next prerequisites for public financial flow remain actual Supabase connectivity and reviewed testnet assets/deployment economics, then user-reviewed signing/receipts. Portfolio pagination and scale validation, external-router attribution and defensible cost basis remain outstanding. No Mainnet execution or beneficial-owner inference is enabled.

## Launch preparation increment - 2026-10-14

Added launch configuration UI and finalized factory/owner/funding checks, actual token-creation/registration/initial-buy simulation, gas estimate and unsigned review. Real-state fork execution verifies prepared calldata and rollback. Caller-selected custom token code/allocation/curve inputs are not supported.

Next prerequisite for a usable public signed launch remains verified reviewed testnet deployment/assets/economics and Supabase connection. Then add user-reviewed factory approval, immediate account/chain/ownership rechecks, signing and receipt-derived actual first-buy results/history. Mainnet financial execution is not authorized.

## Receipt evidence increment - 2026-10-15

Completed finalized direct-factory receipt lookup/review, including actual first-buy spend, token delivery, refund, funded fees, historical accrual owner and block/hash evidence. Preflight simulations remain separate from executed results; no fake receipt/state fallback.

Next prerequisites for public launch signing remain reviewed verified testnet assets/deployment/economics and Supabase connectivity. Future submission must validate chain/account immediately, track replacement/revert/receipts and refresh source ownership/allowances. Nested wallet/router receipt support and broader security review remain outstanding; Mainnet financial execution is not authorized.


## Current Mainnet execution plan — 2026-10-16

This replaces prior testnet-only next steps. Implement human-reviewed launch approval/launch/trade/claim browser transactions against a verified Monad Mainnet deployment; keep backend/agent read-only. Read MAINNET_PROPOSAL.md for pending concrete user review. Readiness requires reviewed deployment, exact first-code block, actual Supabase and healthy canonical index; do not configure fork addresses or guessed assets.

Current work adds factory approval preparation, guarded wallet request/receipt transport and transaction journal across form changes/tab reload. Remaining: review economics/treasury, prepare and verify deployment transactions/source/immutables, configure actual Supabase, exercise actual reviewed economics in full fork suite, connect wallet/browser end-to-end to public deployment, operational capacity/security review. Club/agent/treasury/campaign remain separate unfinished deliverables and are not implied by transaction UI completion.


## Approved configuration update — 2026-10-16

D21 approves the economics in contracts/mainnet-config.mjs. Next: prove this exact scale on the real-state fork, prepare unsigned dependency-ordered deployment against the selected public deployer (also treasury), then verify actual receipts/immutable addresses. User fills SUPABASE_DATABASE_URL and FOUNDRY_DEPLOYER_ADDRESS in ignored backend/.env. Do not insert private keys, fabricate addresses or silently enable execution before actual deployment/index validation.
