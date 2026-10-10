# Frontend

React/Vite. Chạy từ root `npm run dev` (cùng backend) hoặc `npm run dev:frontend`.

API /api proxy sang http://127.0.0.1:3001. Mọi supply/owner/balance/Transfer lấy từ API thật kèm provenance. Chưa có contract Foundry thì launch/fee/claim không khả dụng. Không seeded studios, fake volume hoặc dummy trades. Kết nối ví chỉ đọc tài khoản, chưa SIWE/login và không gửi transaction.


## Canonical market view - 2026-10-10

The Markets section consumes /api/tokens and /api/tokens/:address/history, then opens the same token's /stream. Snapshots replace the full view. Reorg resets remove orphaned trades/candles/holder balances. Disconnects clear market data until a new snapshot arrives; changing token/interval or leaving the view aborts the request and closes the stream.

SVG candles show exact CHOG execution prices at 1m/5m/15m/1h intervals, with OHLC tooltips and preserved time gaps. Geometry uses BigInt prices before converting normalized pixel coordinates. The chart shows the latest 120 populated intervals; API truncation remains explicit. Recent trades retain payer versus callback-router attribution and holder tables label protocol contracts. Raw amounts remain exact strings; no USD conversion or invented volume. Creator and studio links preserve distinct identities. This view is read-only; buy/sell signing is not implemented.

Runtime needs Supabase configuration/migration plus an actual verified factory and deployment block. Missing configuration is shown explicitly. Fork addresses/reports are never supplied to the running application. Optional browser verification runs only within an isolated fork test API, with PLAYWRIGHT_RUNTIME pointing to an installed Playwright package; it verifies actual indexed transactions and branch rollback without intercepting requests or fabricating responses.


## Quote and wallet inspection - 2026-10-10

Market details include a read-only curve quote form and public wallet lookup. Amount parsing uses exact uint256 units with 18 decimals. Contract results show actual input/output, unused maximum budget, fee split and block provenance. Wallet reads expose actual holdings, curve allowances and aggregate beneficiary credits, including old-owner credits. Quote/account data is cleared or canceled on relevant snapshot/input changes. No wallet provider is simulated and no financial transaction is submitted. Graduated curve quotes fail explicitly until a real v4 quoting path exists. See docs/TRADE_API.md.
