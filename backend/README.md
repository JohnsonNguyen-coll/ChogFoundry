# Backend

Node HTTP + ethers, chỉ đọc Monad Mainnet. Chạy từ root: `npm run dev:backend`.

Config địa chỉ/nguồn ở src/config.mjs. RPC mặc định chính thức; MONAD_RPC_URL có thể cấu hình qua backend/.env hoặc environment. Chain mismatch/read failure trả lỗi, không mock fallback.

`npm test` validation/HTTP; `npm run test:live` đối chiếu dữ liệu thật qua RPC độc lập. Chi tiết endpoint/cách chạy ở README root. Chưa auth/DB/indexer/write API; response ownerOf read-only không cấp quyền quản trị.
