# Chog Foundry

**Your Chog. Your studio. Your next launch.**

Dapp mục tiêu trên Monad: Chog NFT mang quyền vận hành studio và studio fee tương lai; creator và phí đã ghi có giữ nguyên sau chuyển NFT.

Hiện tại là **nền tảng thử nghiệm cục bộ**, chưa phải dapp hoàn chỉnh. Không có public deployment, ví thật hoặc tiền thật.

## Chạy

Node.js 22+ và npm. Tại thư mục dự án:

```sh
npm ci
npm test
npm run compile
npm run demo
```

PowerShell có execution policy chặn npm.ps1: dùng `npm.cmd` thay `npm`. Lệnh demo tự khởi tạo EVM trong memory và đóng khi xong; không mở RPC server/port, không cần private key hoặc faucet. Account tự sinh chỉ là fixture cục bộ.

## Đã có

- Solidity FeeLedgerSpike: owner-only đăng ký metadata launch, immutable recorder nhận mock quote và credit creator/owner lúc phát sinh/treasury; pull claim theo beneficiary.
- Test EVM cho chuyển NFT A→B, approved operator, creator bất biến, claim sau chuyển/burn, rounding, failure atomicity và custody literal owner.
- Domain model cho transfer epoch/session/moderator và curve rời rạc với buy/sell, slippage/deadline, reserve và accounting handoff.
- Demo dòng lệnh A→B/claim; fixture fee split chỉ để kiểm thử, không là mức phí được duyệt.

## Chưa có

Factory launch token thật, vesting, market EVM buy/sell, AMM và thu phí sau graduation, indexer/auth backend, web/club/agent, multisig buyback, randomness/campaign và Monad testnet. RegisterLaunch trong spike chỉ đăng ký metadata. Graduation model không tạo pool/LP. Fee recorder chưa gắn với giao dịch thật.

## Cấu trúc

```text
contracts/spikes/    Solidity thử nghiệm, không dùng production
contracts/test/      NFT/quote fixtures
packages/domain/    Mô hình kế toán và quyền cục bộ
scripts/            Compile, EVM fixture, demo
config/             Local environment và evidence chưa kích hoạt
 tests/             Domain + EVM tests
 docs/              Product, decisions, plan, sources, status
```

Đọc [đặc tả](docs/PRODUCT.md), [quyết định](docs/DECISIONS.md), [kế hoạch](docs/IMPLEMENTATION_PLAN.md), [nguồn](docs/SOURCES.md), [tiến độ và giới hạn](docs/STATUS.md). Hướng dẫn cộng tác ở AGENTS.md.

## Giới hạn công cụ

Ganache 7.9.2 dùng làm EVM test in-memory; npm audit còn cảnh báo từ cây dependency của công cụ local. Không dùng Ganache làm dịch vụ public/runtime sản phẩm. Cần thay bộ EVM runner hoặc xử lý dependencies trước CI có input không tin cậy/production. Windows Node 22 có thể báo thiếu binary µWS và tự fallback JavaScript; thử nghiệm vẫn chạy. `artifacts/` và `node_modules/` không đưa vào Git. Không có giấy phép open-source được lựa chọn thay người dùng.
