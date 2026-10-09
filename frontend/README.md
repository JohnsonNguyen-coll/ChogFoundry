# Frontend

React/Vite. Chạy từ root `npm run dev` (cùng backend) hoặc `npm run dev:frontend`.

API /api proxy sang http://127.0.0.1:3001. Mọi supply/owner/balance/Transfer lấy từ API thật kèm provenance. Chưa có contract Foundry thì launch/fee/claim không khả dụng. Không seeded studios, fake volume hoặc dummy trades. Kết nối ví chỉ đọc tài khoản, chưa SIWE/login và không gửi transaction.
