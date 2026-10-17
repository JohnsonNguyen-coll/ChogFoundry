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

## Editorial Chog illustrations

User-supplied illustrations are decorative scenes, never representations of wallet NFTs, studio identity or token data. Every illustration has one placement; none is repeated across different pages or landing sections. The logo/favicon remain the existing brand mark.

| Source | Placement                                                 |
| ------ | --------------------------------------------------------- |
| 1.png  | Landing hero, spark print                                 |
| 2.png  | Landing hero, explorer print                              |
| 3.png  | Landing, bring-your-Chog feature                          |
| 4.png  | Markets directory introduction (not token trading detail) |
| 5.png  | Landing, studio handover feature                          |
| 6.png  | Landing, prepare-a-launch feature                         |
| 7.png  | My studios, disconnected state                            |
| 8.png  | Transactions introduction                                 |
| 9.png  | Portfolio introduction                                    |
| 10.png | Explore introduction                                      |
| 11.png | Page-not-found state                                      |
| 12.png | Network introduction                                      |
| 13.png | Launch studio picker, disconnected state                  |

The unrelated JFIF photograph and 14.png are not used. Original files are preserved. `chog/web/` contains quality-83 WebP delivery copies with a maximum width of 900 pixels, without enlargement. Original backgrounds are retained for framed illustrations. `ChogArtwork` requires an explicit scene and uses empty alternative text and explicit dimensions. Hero and page introduction artwork loads eagerly; lower landing feature artwork loads lazily. Shared `PageIntro` keeps responsive layout consistent while each route gets its own scene. No decorative images are inserted into actual NFT/token rows, trading controls, source evidence or financial status indicators.
