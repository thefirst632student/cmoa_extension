# CMOA Downloader - Chrome Extension

Chrome extension để tải manga từ CMOA (cmoa.jp) dưới dạng file ZIP.

## Cài đặt

### Bước 1: Tải Extension
1. Tải thư mục `cmoa_extension` về máy
2. Giải nén nếu cần

### Bước 2: Cài đặt vào Chrome
1. Mở Chrome, truy cập địa chỉ: `chrome://extensions/`
2. Bật **Chế độ dành cho nhà phát triển** (Developer mode) - góc trên bên phải
3. Nhấn **Tải tiện ích đã giải nén** (Load unpacked)
4. Chọn thư mục `cmoa_extension`

### Bước 3: Sử dụng
1. Truy cập trang manga trên CMOA (ví dụ: `https://www.cmoa.jp/title/xxxxx`)
2. Mở trình đọc
3. Nhấn vào icon extension ở thanh công cụ Chrome
4. Nhấn nút **Download as ZIP**
5. Chọn vị trí lưu file ZIP

---

## Tính năng

- Tải toàn bộ ảnh manga từ CMOA
- Tự động giải mã và ghép ảnh (descrambling)
- Đóng gói thành file ZIP
- Hiển thị tiến trình tải trên popup

---

## Sự khác biệt với pyspeedbinb

| Đặc điểm | Extension này | pyspeedbinb |
|----------|---------------|-------------|
| **Môi trường** | Chrome Extension (browser) | Python script (terminal) |
| **Giao diện** | GUI với popup, progress bar | CLI only |
| **Cài đặt** | Không cần Python, cài trực tiếp vào Chrome | Cần Python, cài dependencies |
| **Xử lý ảnh** | OffscreenCanvas, JSZip | Pillow (PIL) |
| **Lưu trữ** | File System Access API (cho chọn nơi lưu) | Lưu vào thư mục hiện tại |
| **Tốc độ** | Xử lý tuần tự, gửi ảnh từng cái | Có thể batch process |
| **Độ trễ** | Cần reload trang sau khi cài extension | Chạy trực tiếp |

### Chi tiết kỹ thuật

1. **Key Table Decryption**
   - pyspeedbinb: Sử dụng `ContentID` từ response để decrypt
   - Extension này: Sử dụng `cid` từ URL parameter (`req_cid`) - đây là bug fix quan trọng

2. **Type2 Scrambler**
   - pyspeedbinb: Note rằng cần swap keyH/keyS
   - Extension này: Đã implement swap đúng cách

3. **Image URL Format**
   - pyspeedbinb: Direct image URL
   - Extension này: Sử dụng `sbcGetImg.php?cid=...&src=...&p=...`

4. **Deduplication**
   - pyspeedbinb: Không có
   - Extension này: Tự động loại bỏ ảnh trùng lặp (ttx có 2 lần cùng 1 src)

---

## Troubleshooting

### "Missing: INFO, CONTENT..."
- Reload trang trình đọc manga sau khi cài/reload extension
- Đảm bảo đang ở trang trình đọc (`/bib/speedreader/...`)

### "Failed to decrypt key tables"
- Có thể do cid/k không đúng, thử reload trang

### Extension không hoạt động
1. Kiểm tra extension đã được bật trong `chrome://extensions/`
2. Kiểm tra console của Service Worker (nhấn "Service Worker" trong trang extensions)
3. Reload extension và refresh trang manga

---

## File Structure

```
cmoa_extension/
├── manifest.json      # Extension config (Manifest V3)
├── background.js      # Service worker - xử lý download
├── content.js         # Content script - nhận message từ page
├── inject.js          # Injected script - intercept fetch/XHR
├── core.js            # SpeedBinB decryption logic
├── popup.html         # Popup UI
├── popup.js           # Popup logic
├── offscreen.html     # Offscreen document for ZIP
├── offscreen.js       # ZIP creation + File System Access
└── jszip.min.js       # JSZip library
```

---

## Credit

- **SpeedBinB decryption logic**: Converted from [pyspeedbinb](https://github.com/suwatchai-uwm/pyspeedbinb) Python library
- **Code conversion & debugging**: GLM 5 (Zhipu AI)
- **Original algorithm**: Based on reverse engineering of SpeedBinB reader JavaScript

---

## License

This project is for educational purposes only. Use responsibly and respect copyright laws.

---

## Disclaimer

Extension này chỉ dành cho mục đích học tập. Người dùng chịu trách nhiệm tuân thủ điều khoản sử dụng của CMOA và luật bản quyền.
