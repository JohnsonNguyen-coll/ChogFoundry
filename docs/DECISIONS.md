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

## Công cụ đang dùng cho spike cục bộ (có thể thay)

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
