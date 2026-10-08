# Tiến độ — 09/10/2026

## Đã thực hiện

- Kiểm tra D:/PythonTool/ChogFoundry: thư mục trống, chưa có Git, không có AGENTS.md ở workspace hoặc thư mục cha đã kiểm tra. Không có file cũ bị ghi đè.
- Lưu baseline PRODUCT.md, DECISIONS.md, IMPLEMENTATION_PLAN.md, SOURCES.md; tạo AGENTS.md và README.
- Dựng Node ESM workspace, lockfile, local-only config, Solidity spike, fixtures và domain models. Stack sản phẩm/fee/curve/AMM vẫn chưa được chốt thay người dùng.
- M0 hoàn thành. M1 có spike chạy được; M2 mới có mô hình kế toán. M3–M8 chưa hoàn thành.

## Bằng chứng kiểm thử

- `npm test`: **13/13 pass** trên Windows, Node 22.15.1; 5 EVM tests và 8 domain tests.
- `npm run compile`: thành công với solc 0.8.36, EVM Shanghai, optimizer 200. Artifact local trong artifacts/contracts.json (ignored).
- `npm run demo`: thành công; fee fixture 1000 + 1000, trước transfer A có 500 credit, sau transfer A có 700 (creator cũ vẫn A), B có 300, treasury 1000. A claim 700 sau bán NFT, escrow còn liability 1300. Đây là đơn vị quote mock nguyên, không phải giá trị $CHOG thực.
- Graduation model: sau mua 800/1000 units, bàn giao kế toán 719200 quote + 200 token units; không deploy pool hay LP.
- Test domain A→B→A vô hiệu sessions/moderator; ownership reader chưa đồng bộ thì từ chối mutation; claims cũ không cần quyền owner.
- EVM tests cover owner-only registration, approved operator bị từ chối, nhiều launch/studio, recorder-only credit, creator bất biến, claim replay, rounding, failed/taxed transfer rollback, failed claim rollback, NFT burn và literal custody owner.

## Giới hạn / công việc chưa chứng minh

- RegisterLaunch chỉ là metadata; chưa phát hành token ERC-20, chưa có vesting/market thật. Mock recorder trả phí bằng fixture quote; không là trade/router/AMM.
- Curve chỉ là mô hình BigInt rời rạc, chưa có wallet holdings, ERC-20 decimals, MEV/economic analysis. Graduation chỉ bàn giao kế toán, chưa có external-call rollback, LP management hoặc phí sau graduation.
- Transfer epoch model chưa ingest canonical chain events, chưa SIWE/backend/indexer; reorg và race giữa đọc owner/API write cần triển khai và test.
- Reentrancy guard đã có nhưng chưa adversarial callback/fuzz/audit. Không được coi số test pass là chứng nhận an toàn.
- Custody credit tới literal owner có thể bị kẹt nếu contract đó không thể claim; chưa chọn policy UX/adapter. Không suy đoán ví hưởng lợi.
- Chưa xác minh địa chỉ NFT, runtime $CHOG hay thể lệ Chogathon. Nguồn và evidence disabled xem SOURCES/config.
- Chưa có UI, club, agent, treasury buyback/campaign hoặc deployment Monad.

## Tooling debt

`npm audit` sau pin solc 0.8.36: **38 findings** (2 low, 8 moderate, 23 high, 5 critical), trong cây dependency công cụ thử nghiệm. Report: artifacts/dependency-audit.json (ignored). Không tuyên bố audit sạch, kể cả `--omit=dev` có thể vẫn báo bundled dependencies của Ganache. Cần thay Ganache hoặc xử lý tooling dependencies trước khi đưa CI/input không tin cậy/production; không chạy RPC server public. Không tự dùng audit fix --force vì sẽ đổi công cụ lớn.

Ganache báo không có binary µWS phù hợp Windows Node 22, fallback JavaScript và tests/demo vẫn thành công. Compiler target Shanghai chỉ cho local runner, chưa chứng minh compatibility/gas Monad.

## Bước tiếp có thể làm độc lập

1. Thay hoặc harden EVM test runner; bổ sung adversarial callbacks/property tests khi triển khai market.
2. Fixed-supply token + creator vesting prototype, rồi ghép curve market EVM với fee escrow, slippage/deadline và reserve invariants bằng tham số fixture rõ ràng.
3. Nghiên cứu ứng viên AMM từ tài liệu/code/deployment chính thức: bắt buộc chứng minh mọi swap route thu studio fee theo owner lúc phát sinh, cả direct pool; kiểm tra LP custody/fee tổng.
4. Đề nghị người dùng chọn curve/AMM/fee khi đã có kết quả so sánh cụ thể. Không mainnet hoặc tiền thật.
