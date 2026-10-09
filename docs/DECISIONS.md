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
