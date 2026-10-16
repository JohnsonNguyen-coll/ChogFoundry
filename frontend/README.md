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

## Wallet portfolio dashboard - 2026-10-13

The Portfolio section accepts a public or connected wallet and lists holdings/activity across the configured Foundry factory index. All positions share one canonical checkpoint. Sold/transferred-out tokens with recorded activity remain visible. Market links open the actual selected token; no source-chain explorer links are fabricated for fork data. Sequential ten-second refresh, 25-second fetch bounds, cancellation and error clearing prevent old-wallet/failure fallback. PnL/USD valuation remain unavailable and token quantities are not summed across assets.

## Launch wizard - 2026-10-14

The Launch section accepts real NFT ID, connected/public creator address, UTF-8 name/symbol, optional maximum first-buy budget, explicit minimum output and deadline. It reads verified factory bindings/current owner and simulates actual launch with rollback. Review includes supply/allocation, observed inventory split, curve fee split, maximum funding/allowance, gas, simulated address and unsigned calldata/source. Missing configuration is unavailable; no sample token/default curve price or financial signature is provided. Actual first-buy spend/output are unavailable from the factory return and require future receipt evidence.

## Completed launch receipt review - 2026-10-15

The launch wizard also accepts a public transaction hash for its selected NFT. Canonical direct-factory receipts show the created token, original creator, actual paid first-buy/refund/token delivery, recorded fee split/accrual owner, gas and source. Preflight simulated values never become a completed result. Pending/unfinalized/reverted/wrong/orphaned receipts stay unavailable; edits to hash/NFT/wallet cancel old reads. Current ownership and draft metadata do not rewrite a historical launch. No transaction submission is enabled.


Mainnet wallet flow (2026-10-16): launch funding approval, launch, curve/v4 exact-input trades and recorded-beneficiary claims can request human wallet confirmation after explicit execution configuration and canonical deployment/Supabase readiness. No public-wallet inspection signs. Fresh backend review and same-block current wallet simulation precede each request. TransactionCenter retains public pending evidence across form changes and tab reload, verifies finality and explicit same-nonce replacements, and never retries automatically. No public deployment or connected hosted database is implied by the UI.



Wallet connection now uses RainbowKit + wagmi2 + viem. The selected connector provider powers profile personal_sign and all wallet transaction/receipt paths; the application never falls back to window.ethereum. Only Monad Mainnet143 is configured. A wrong network/disconnect/connector/account change clears usable wallet/provider and stale balances, while the transaction journal remains public historical evidence. Backend ownership/Transfer/session checks are unchanged.

Copy frontend/.env.example to frontend/.env (the ignored file has been prepared if absent). Fill VITE_WALLETCONNECT_PROJECT_ID with your own public Project ID from the WalletConnect/Reown dashboard to enable mobile QR sessions. Do not enter Supabase secrets or wallet keys in any VITE_ field. Without an ID, browser wallets remain usable and WalletConnect is omitted with an explicit notice. Restart the dev server after changing frontend environment values.
