# Frontend

React/Vite. Chạy từ root `npm run dev` (cùng backend) hoặc `npm run dev:frontend`.

API /api proxy sang http://127.0.0.1:3001. Mọi supply/owner/balance/Transfer lấy từ API thật kèm provenance. Chưa có contract Foundry thì launch/fee/claim không khả dụng. Không seeded studios, fake volume hoặc dummy trades. Kết nối ví chỉ đọc tài khoản, chưa SIWE/login và không gửi transaction.


## Canonical market view - 2026-10-10

The Markets section consumes /api/tokens and /api/tokens/:address/history, then opens the same token's /stream. Snapshots replace the full view. Reorg resets remove orphaned trades/candles/holder balances. Disconnects clear market data until a new snapshot arrives; changing token/interval or leaving the view aborts the request and closes the stream.

SVG candles show exact CHOG execution prices at 1m/5m/15m/1h intervals, with OHLC tooltips and preserved time gaps. Geometry uses BigInt prices before converting normalized pixel coordinates. The chart shows the latest 120 populated intervals; API truncation remains explicit. Recent trades retain payer versus callback-router attribution and holder tables label protocol contracts. Raw amounts remain exact strings; no USD conversion or invented volume. Creator and studio links preserve distinct identities. This view is read-only; buy/sell signing is not implemented.

Runtime needs Supabase configuration/migration plus an actual verified factory and deployment block. Missing configuration is shown explicitly. Fork addresses/reports are never supplied to the running application. Optional browser verification runs only within an isolated fork test API, with PLAYWRIGHT_RUNTIME pointing to an installed Playwright package; it verifies actual indexed transactions and branch rollback without intercepting requests or fabricating responses.


## Quote and wallet inspection - 2026-10-10

Market details include a read-only curve quote form and public wallet lookup. Amount parsing uses exact uint256 units with 18 decimals. Contract results show actual input/output, unused maximum budget, fee split and block provenance. Wallet reads expose actual holdings, curve allowances and aggregate beneficiary credits, including old-owner credits. Quote/account data is cleared or canceled on relevant snapshot/input changes. No wallet provider is simulated and no financial transaction is submitted. Graduated curve quotes fail explicitly until a real v4 quoting path exists. See docs/TRADE_API.md.


## Graduated quote view - 2026-10-10

The same quote form now supports a configured, verified v4 quoter. It shows actual simulated spend/output, unused input, required maximum funding/approval budget and spender. Protocol category fees and the pool LP rate are shown separately; LP fees are embedded in pool deltas and not fabricated as CHOG amounts. Missing quoter remains unavailable. No approval/swap/claim transaction is submitted and no post-graduation rates are product defaults.

## Settlement inspection - 2026-10-10

After a quote and public wallet lookup, users enter their own slippage percentage and deadline duration. The read-only preflight displays actual settlement status/blockers, minimum output, deadline, gas estimate and unsigned calldata/source. Changes in wallet/token/side/amount/protections/cursor clear stale results. No approval or signing is requested; successful inspection still has execution disabled.

## Approval and fee claim review - 2026-10-11

Quote details provide an exact allowance plan for the actual curve/lock spender. A nonzero insufficient allowance shows a reset first; later approval gas is unavailable until that reset is confirmed and the plan refreshed. The wallet section provides claim inspection for its actual recorded credits, including former studio-owner credits. Both show unsigned calldata/source and remain read-only, with abort/discard behavior on input and snapshot changes.

## Event-recorded payer and recipient - 2026-10-12

Recent trades now show recipient separately from payer/callback router. Curve identities retain their market events; v4 payer/recipient require a unique official lock settlement matched to the bound pool swap. Evidence log index is visible. Unsupported routes remain labeled payer unknown. Indexed summary reports matched/unresolved trades and older rows requiring reviewed rescan; no transaction-sender or custody inference is used.

## Wallet token activity - 2026-10-13

Public/connected wallet inspection also reads /wallet-history for the selected token. Indexed holdings and token flows use full mint-to-checkpoint replay; related trade roles distinguish payer and recipient. Expandable lists show the last 100 matching trades/transfers with limits and catch-up/source indicators. PnL/cost basis remain unavailable. Changing wallet/token/cursor aborts pending reads and clears the previous wallet's data; no wallet provider or data fallback is simulated.
