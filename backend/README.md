# Backend

Node HTTP + ethers, chỉ đọc Monad Mainnet. Chạy từ root: `npm run dev:backend`.

Config địa chỉ/nguồn ở src/config.mjs. RPC mặc định chính thức; MONAD_RPC_URL có thể cấu hình qua backend/.env hoặc environment. Chain mismatch/read failure trả lỗi, không mock fallback.

`npm test` validation/HTTP; `npm run test:live` đối chiếu dữ liệu thật qua RPC độc lập. Chi tiết endpoint/cách chạy ở README root. Chưa auth/DB/indexer/write API; response ownerOf read-only không cấp quyền quản trị.


## Market data foundation

The read-only market endpoint is documented in the root README. market-data.mjs reads actual registered curve logs and official v4 PoolManager swaps, validates canonical event blocks, builds 36-decimal integer OHLC/volumes and conditionally reconstructs mint-to-snapshot holders. Missing factory configuration or incomplete holder history is explicit. The persistent MarketIndexer/MarketStore and SSE endpoints now build on this reader. No fake prices or seeded tokens are provided. Existing profile SQLite/auth APIs remain operational.


The separate markets.sqlite database stores deployment anchors, canonical chunk checkpoints and per-token event windows. Exact factory deployment configuration is required; nothing is indexed by default. See root README for history/SSE contracts, response truncation, operational budgets, finality and rollback behavior. Market indexing does not replace studio authorization or transfer epochs.


## Current primary database

Supabase PostgreSQL supersedes the SQLite runtime storage described historically above. Both profile and market callers are async; profile optimistic revision checks and market commit/rollback use real PostgreSQL transactions. TLS verification is enabled and credentials are backend-only. No connection is configured by default. Follow docs/SUPABASE_SETUP.md. Legacy SQLite is retained for explicit import/local tests, never runtime failover. Sessions remain in RAM.
