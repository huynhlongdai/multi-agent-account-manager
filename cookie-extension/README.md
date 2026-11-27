# Account Manager Cookie Exporter (Chrome Extension)

Extension chuyên dụng cho Google Chrome, Microsoft Edge, Brave, Cốc Cốc giúp trích xuất và copy trọn bộ Cookie đăng nhập các dịch vụ AI (**Muse · Meta**, **Hark**, **Claude**, **ChatGPT**...) chỉ bằng **1 click** để nạp trực tiếp vào **Multi-Agent Account Manager (叠号)**.

---

### Điểm nổi bật:
* **Tự động nhận diện dịch vụ**: Tự nhận biết bạn đang ở tab Muse, Hark hay Claude.
* **Gom trọn bộ Domain liên quan**:
  - Với **Muse · Meta**: Tự động gom đồng thời cookies từ `muse.ai` + `meta.com` + `accountscenter.meta.com` (giúp desktop app nhận diện chuẩn email chính thức và không bị mất phiên).
  - Với **Claude · Anthropic**: Tự động gom cookies từ `claude.ai` + `anthropic.com`.
  - Với **Hark**: Gom `hark.com` + `app.hark.com`.
* **Chuẩn định dạng JSON**: Format xuất ra khớp 100% bộ đọc Cookie của Multi-Agent Account Manager.

---

### Hướng dẫn cài đặt vào trình duyệt (Chỉ mất 30 giây):

1. Mở trình duyệt Chrome / Edge / Brave / Cốc Cốc.
2. Truy cập vào trang quản lý tiện ích:
   - Trên Chrome: nhập `chrome://extensions/`
   - Trên Edge: nhập `edge://extensions/`
3. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
4. Bấm nút **"Tải tiện ích đã giải nén" (Load unpacked)**.
5. Chọn thư mục:
   `E:\2026\Project\Multiagent\account-manager-cookie-extension`
6. Tiện ích **Account Manager Cookie Exporter** sẽ xuất hiện trên thanh công cụ của trình duyệt. Bạn có thể ghim (Pin) nó lên thanh địa chỉ để tiện bấm.

---

### Cách sử dụng:

1. Đăng nhập tài khoản của bạn trên trình duyệt (ví dụ `muse.ai` hoặc `claude.ai`).
2. Bấm vào icon extension trên thanh công cụ:
   - Extension sẽ tự động đếm số lượng cookie và hiển thị dịch vụ tương ứng.
3. Bấm **"Copy for Account Manager"**:
   - Toàn bộ cookie hợp lệ sẽ được copy vào Clipboard ngay lập tức.
4. Mở ứng dụng **Account Manager** trên máy tính:
   - Bấm **+ Add (hoặc Account Settings)**.
   - Nhấn `Ctrl + V` vào ô **Import Cookies**.
   - Bấm **Create & Launch** (hoặc Import).
   - Ứng dụng sẽ tự động đăng nhập ngay lập tức mà không cần gõ mật khẩu hay vượt captcha!
