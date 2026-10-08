# Trung tâm Thông báo V1 — Preview ĐỘC LẬP

- GitHub branch: `feat/notification-center-v1`.
- Dedicated Cloudflare Worker: `mynh-erp-notify-v1` (không dùng Worker `mynh-erp-v5`).
- URL dự kiến sau khi QA smoke PASS: `https://mynh-erp-notify-v1.mynh-forwork.workers.dev`.
- Preview gốc `desktop-polish-v1-mynh-erp-v5.mynh-forwork.workers.dev` **không đổi**.
- Production `main` **không đổi**.
- Cùng Supabase V5 production: schema mới là bổ sung, không xóa/chỉnh bảng Tracking/Telegram.
- Không chạy scheduler Tracking/Telegram thứ hai trên Worker mới.
- API /api/alerts/in-app không ghi nhận mới khi chưa triển khai migration, sẽ tiếp tục trả cảnh báo vận chuyển cũ có cảnh báo trạng thái.
- Không tạo thông báo demo/đơn demo trên database thật.
- Chuông 15 phút khi đóng, 5 phút khi mở, nghỉ khi tab ẩn.
- Phân biệt đã đọc và đã xử lý, phân quyền người nhận; sự kiện nghiệp vụ do service_role phát hành, không phải trình duyệt.
- Chưa triển khai producer thông báo cho tất cả module: đây là nền tảng V1.
- Cùng account Cloudflare Free vẫn có chung hạn mức Requests, dù đã tách Worker.

## Kiểm thử trước khi phát hành
- Build OpenNext + cấu hình Worker riêng + smoke /api/health và /login.
- Chỉ áp dụng migration additive sau khi xác minh SQL, không động đến dữ liệu đơn hàng thật.
- Sau khi auth QA có thể PASS: kiểm tra vai trò admin/operator/viewer, danh sách theo người nhận, filter, đánh dấu đọc, xử lý, Escape, click ngoài, phân trang, 1440×900 và 2560×1600.
