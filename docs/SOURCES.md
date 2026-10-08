# Nguồn và xác minh

Kiểm tra ngày **09/10/2026, Asia/Bangkok**. Chỉ lưu điều quan sát được, không suy đoán runtime từ search result.

| Nguồn | Kết quả | Giới hạn / bước tiếp |
|---|---|---|
| https://www.chog.xyz/ | Website công bố $CHOG contract: `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` | Chưa đọc chainId/code/decimals/proxy/transfer behavior qua RPC; chưa bật config mạng thật |
| https://build.chog.xyz/ | Đã đọc trang builder sau khi truy cập qua liên kết; có hướng dẫn apply/build/community testing | Không thấy Chogathon, scoring/deadline/video requirements trong trang đọc được; không tái xác minh được thể lệ 2026 |
| https://portal.chog.xyz/ | Link từ website Chog; nội dung trích xuất chỉ có portal shell | Không đủ xác minh collection |
| https://linktr.ee/chognft | Có liên kết tới website, builder và Chog Genesis OpenSea | Chỉ là đầu mối discovery, không tự coi là bằng chứng address |
| https://opensea.io/collection/chog-genesis | Đọc được collection qua link trên | Nội dung trích xuất không cung cấp contract address; chưa xác nhận collection runtime |
| https://docs.monad.xyz/developer-essentials/network-information | Đã đọc tài liệu network mainnet chính thức | Bảng có nhiều ô không được extractor trả về; không lấy giá trị từ mirror để hardcode |
| https://docs.monad.xyz/developer-essentials/testnet | Đã đọc trang testnet chính thức; trang ghi testnet reset 16/12/2025 | Address testnet cũ cần kiểm tra lại; không suy từ mainnet/testnet đời trước |
| https://eips.ethereum.org/EIPS/eip-721 | Chuẩn ownerOf, Transfer, approved operators | Fixture chỉ triển khai phần tối thiểu cho spike; không xác nhận Chog tuân thủ đầy đủ |
| https://eips.ethereum.org/EIPS/eip-4361 | Đã đọc chuẩn đăng nhập ví làm nguồn cho kế hoạch auth | Chưa triển khai SIWE backend |

## Checklist xác minh contract trước khi kết nối tài sản

1. Liên kết/announcement chính thức chứa address + chain; kiểm tra chéo explorer có source verified.
2. RPC chainId và eth_getCode; ABI/ERC-165 nếu NFT; ownerOf vài token mẫu và Transfer log.
3. $CHOG decimals, symbol, totalSupply, allowance/transfer behavior; proxy/implementation/admin và quyền thay đổi.
4. Ghi block number/hash/thời điểm kiểm tra, URL/source và kết quả vào đây. Nếu nguồn mâu thuẫn, giữ disabled.
5. Collection testnet và quote testnet có thể không tồn tại. Demo dùng mock phải ghi rõ, không gắn nhãn official Chog.

Không có địa chỉ NFT placeholder. `config/environments.mjs` chỉ chứa evidence $CHOG đã công bố, disabled; mọi thử nghiệm hiện dùng asset tạo trong EVM memory.
