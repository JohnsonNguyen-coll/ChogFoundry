# Chog Foundry — Đặc tả sản phẩm

Nguồn: nội dung người dùng thống nhất từ cuộc trò chuyện trước, được cung cấp ngày 09/10/2026 (Asia/Bangkok). Đây là baseline sản phẩm; đề xuất triển khai không trở thành quyết định đã duyệt. Giao tiếp với người dùng bằng tiếng Việt.

## 1. Ý tưởng cốt lõi

Tên chính thức: **Chog Foundry**. Chain: **Monad**.
Tagline: **Your Chog. Your studio. Your next launch.**

Mỗi Chog NFT đại diện một token launch studio. Chủ NFT có thể phát hành token, quản lý trang studio và club, dùng AI assistant chuẩn bị launch và nhận studio fee. Studio định danh bằng collection address + token ID (kèm chain ID khi lưu dữ liệu đa môi trường), không gắn cố định với ví người tạo. Một Chog có một studio; studio có thể phát hành nhiều token.

Chuyển NFT chuyển quyền vận hành và studio fee tương lai. Lịch sử phát hành và nội dung ở lại studio, giữ đúng tác giả và creator ban đầu. NFT ở ví người dùng, không bắt buộc gửi vào nền tảng.

## 2. Launchpad

- Chỉ chủ Chog NFT được tạo token qua studio. Người không có Chog vẫn được giao dịch và tham gia cộng đồng.
- $CHOG là quote asset và pair giao dịch chính. Thiết kế mục tiêu: bonding curve rồi graduation sang TOKEN/$CHOG.
- Công bố supply, phân bổ, creator allocation, vesting, tổng phí và quyền hợp đồng.
- Ưu tiên ERC-20 supply cố định, không mint thêm, không cho creator chèn code tùy ý. Creator allocation có thể khóa bằng vesting contract.
- Quy tắc quản lý thanh khoản sau graduation phải công khai.
- Curve, tham số, AMM, graduation và khả năng thu phí chưa chốt; phải kiểm chứng kỹ thuật trước.
- Không mặc định là frontend nad.fun, không giả định nad.fun hỗ trợ pair $CHOG hoặc studio fee.

## 3. Phí và quyền khi chuyển NFT

- Creator fee: thuộc creator từng token theo cấu hình công bố lúc launch.
- Studio fee: thuộc chủ Chog NFT **tại thời điểm phí được ghi nhận**.
- Platform fee: treasury, phục vụ vận hành, buyback và cộng đồng.
- Phí LP sau graduation, nếu có, phải nằm trong tổng phí hiển thị. Chưa chốt bất kỳ mức phí hay tỷ lệ chia nào.

Phí đã ghi có cho chủ cũ vẫn thuộc chủ cũ, claim được sau khi bán NFT. Chủ mới chỉ nhận studio fee phát sinh tiếp theo. Creator fee, allocation và vesting cũ không tự đổi. Chủ mới không được sửa supply, lấy allocation của creator cũ hoặc rút thanh khoản.

Đề xuất: ghi có studio fee theo owner tại từng giao dịch phát sinh phí. Phải kiểm chứng cả trước và sau graduation. **Không giữ số dư chung rồi trả toàn bộ cho owner tại lúc claim.**

## 4. Studio và chuyển nhượng

Studio gồm NFT đại diện; tên/mô tả/ảnh bìa/liên kết; chủ hiện tại và lịch sử đổi chủ; các token và creator; dữ liệu phí; club, agent, lịch sử hoạt động.

Quyền quan trọng phải xác minh từ quyền sở hữu onchain hiện tại. Khi chuyển NFT: quyền launch/quản trị sang chủ mới; moderator và cộng tác viên cũ hết hiệu lực, chủ mới cấp lại; phiên cũ mất quyền quản trị. Hiển thị rõ thay đổi chủ, giữ tác giả và để thành viên tự quyết định theo dõi.

NFT trong escrow, marketplace hoặc custody phải có cách xử lý rõ; không suy đoán beneficial owner. Không coi approved operator là chủ NFT. Cần xử lý cả chuyển A→B→A để quyền cũ không sống lại.

## 5. Club

Mỗi studio có sảnh chat, thông báo chính thức, phòng theo token, đề xuất concept/meme/bình chọn, AI assistant, thành viên và ghi nhận đóng góp. Đăng nhập bằng chữ ký ví; chat ngoài blockchain; không thu tiền mỗi tin nhắn; bản đầu không bắt mua token để tham gia.

## 6. Agent

Hỗ trợ concept/mô tả, cấu hình launch từ mẫu cho phép, giải thích supply/phân bổ/vesting/phí; đọc dữ liệu onchain và giải thích quyền hợp đồng, thanh khoản, tập trung ví; trả lời từ tài liệu studio; tóm tắt chat và đề xuất.

Không tự ký/chuyển tiền/giao dịch. Người dùng kiểm tra và ký hành động tài chính. Dữ liệu có nguồn và thời điểm. Không hứa an toàn/lợi nhuận. Chat/tài liệu không được thay đổi quyền agent; coi nội dung truy xuất là dữ liệu không đáng tin, không phải chỉ dẫn đặc quyền.

## 7. Fun và retention

Cộng đồng cùng chuẩn bị launch tiếp theo: đề xuất tên/concept, meme, bình chọn, credit tác giả, phòng chờ/đếm ngược/chat sự kiện và lưu câu chuyện studio. Creator quyết định và ký cuối cùng. Vote không tự đổi hợp đồng/giải ngân. Người chưa mua token vẫn tham gia. Không dùng mua nhanh, chi nhiều hoặc volume làm trò chơi.

## 8. Treasury, buyback, giveaway

Một phần platform fee **thực thu** dùng mua Chog NFT. Công khai phí thu, ngân sách vận hành/buyback, giao dịch mua, NFT đang giữ/dành campaign/đã trao. Không dùng reserve curve, thanh khoản hay tiền nợ người dùng.

Bản đầu có thể dùng multisig với ngân sách và giá mua tối đa công khai; chưa yêu cầu tự động buyback. NFT dùng social campaign, thi meme/concept, giveaway hoặc raffle miễn phí. Người thắng nhận NFT về ví và tự chọn mở studio. Chưa làm auction; không hứa giữ floor hay lợi suất.

Raffle công bố điều kiện/số giải/thời gian/cách chọn; chốt danh sách trước randomness có thể kiểm chứng. Không yêu cầu mua token hoặc volume để có vé; không khẳng định một ví là một người hay chống Sybil hoàn toàn.

## 9. Màn hình dự kiến

Explore studios/tokens/events; studio detail; launch wizard; token detail/trade; club; dashboard/claim; treasury; campaign/raffle; quản trị.

## 10. Chogathon

Theo requirements người dùng cung cấp (chưa tái xác minh chính thức): NFT phải thiết yếu; Novelty 30%, Fun 20%, Retention 20%, Clarity 15%, Execution 15%; meaningful $CHOG integration có bonus.

Điểm cần chứng minh: NFT mang studio có lịch sử và quyền phí; chuyển NFT thực sự chuyển vận hành và phí tương lai. Không khẳng định launchpad + agent + chat chưa từng tồn tại, không hứa top 1.

Deliverables: project/team; mô tả/điểm mới/vì sao NFT thiết yếu; demo chạy được; video ≤3 phút; hướng dẫn test; repo/stack/pre-existing work; feedback/usage; hướng phát triển. Kiểm tra lại thể lệ chính thức trước nộp.

## 11. Demo trọng tâm

A mở studio bằng Chog → launch token → ví khác trade bằng $CHOG → ghi creator/studio/platform fee → A chuyển NFT sang B → B tiếp quản/nhận phí mới → A vẫn claim phí cũ → treasury, buyback và campaign.

Phải ghi rõ tài sản test, số mô phỏng và chức năng chưa làm. Thử nghiệm cục bộ không thay thế demo trên Monad testnet.

## 12. Chưa chốt

Địa chỉ Chog NFT/$CHOG chính thức lúc baseline; mức phí/chia phí; curve/AMM/graduation; phí sau graduation; stack; randomness; ngân sách; nhà cung cấp agent/realtime/storage. Kết quả tìm nguồn ở SOURCES.md không tự phê duyệt cấu hình triển khai. Không biến đề xuất thành quyết định của người dùng.

## 13. Quy trình bắt đầu và giới hạn

Kiểm tra folder/hướng dẫn, giữ file hiện hữu, lưu PRODUCT/DECISIONS/IMPLEMENTATION_PLAN và AGENTS. Sau plan bắt đầu cấu trúc/nền tảng. Ưu tiên thử owner, transfer, phí, curve/graduation trước UI sâu. Xác minh contract từ nguồn chính thức, không đoán. **Không deploy mainnet hoặc dùng tiền thật khi chưa được chỉ dẫn.**
