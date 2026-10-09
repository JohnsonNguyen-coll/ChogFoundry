# Chog Foundry — logo & favicon

## Concept

Chog thợ rèn studio: giữ lông tím, mặt kem, mắt lớn và má hồng của Chog gốc; thêm kính bảo hộ lime và chiếc chìa khóa studio. Chìa khóa tượng trưng NFT mang quyền mở/tiếp quản studio, kính tượng trưng maker chuẩn bị lần launch tiếp theo.

- Ảnh nguồn: `logo.png`, giữ nguyên. SHA-256: `B76A40B6CFDBA31DD4BEA4835871F3AA79BFCFD337A23699447B34739246C8BD`.
- Logo biến tấu: `chog-foundry-logo.png`, 1254×1254, PNG alpha, không chữ.
- Bản dùng trên web: `chog-foundry-logo.webp`, 512×512, alpha; giảm dung lượng tải, giữ PNG master để xuất video/thiết kế.
- Dùng logo tại header/footer/hero. Wordmark được render bằng text HTML.
- Favicon ở `frontend/public/`: ICO gồm 16/32/48/64px; PNG 16/32/48/64/192/512px, Apple touch icon 180px. Resize/đóng gói cùng artwork, không vẽ lại favicon bằng logo khác.
- Công cụ sáng tạo: built-in `image_gen` theo skill imagegen; Sharp chỉ resize/encode và tạo ICO, không chỉnh sáng tạo ảnh.

## Final generation prompt

Use case: logo-brand / edit of supplied raster mascot. Input image 1 is Chog identity reference and redesign target. Create ONE polished square standalone app logo emblem for Chog Foundry, a creative token launch studio whose NFT acts as the studio ownership key. Genuinely redesign the reference, not just crop it or recolor its background. Keep the recognizable purple spiky Chog fur, cream face, huge playful black eyes with white highlights, pink cheeks, mischievous friendly expression and strong dark outlines. Redraw as a compact front-facing simplified mascot head with a small pair of charcoal blacksmith/creator goggles resting on its forehead with lime lenses. Incorporate ONE chunky lime studio key immediately beneath the face as a unified part of the emblem: broad round bow on the lower left, short horizontal shaft and two bold square teeth to the lower right, visually framing the lower edge of the head; no arms/body necessary. Concept: Chog is the maker and the key opens the next launch. Style: crisp flat vector-like mascot logo, consistent very bold dark charcoal contours, limited flat palette purple #6238ae, cream #f9ead7, pink #d44281, lime #d2fb67, charcoal #20271e. Generous simple shapes, no microdetails, memorable silhouette readable at 32 pixels. Center the entire integrated face+key emblem, nearly fill square with 5% clear padding. Fully visible head including ears/spikes, not cropped. Transparent background, actual alpha. NO text, letters, wordmark, watermark, border container, mockup, scenery, extra symbols, rockets, coins or gradients. Output just the single final finished emblem.
