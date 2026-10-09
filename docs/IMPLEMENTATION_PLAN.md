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
