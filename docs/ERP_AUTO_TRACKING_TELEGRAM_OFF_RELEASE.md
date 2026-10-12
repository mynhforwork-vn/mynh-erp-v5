# Kế hoạch gỡ Telegram khỏi Cloudflare `erp-auto-tracking`

**Trạng thái:** đã tạo bản ứng viên và QA offline, **chưa deploy, chưa sửa Worker Production**. Đây là thay đổi riêng, không phải mã chạy trong Worker `mynh-erp-v5`.

## Nguồn và tính toàn vẹn

- Worker đang chạy: `erp-auto-tracking`, deployment `b6257410-6f8a-4e56-8ddc-319deb4b2046`, version `6f26895d-5af0-43dc-978a-b761d7c39dd8`.
- SHA-256 mã nguồn được xác minh: `323203d44a8259f04c8f9c719d55db21fcc4e9135b087bf4ad35e751e4fe5660`.
- SHA-256 mã ứng viên: `2668d003b2406eef1b49310f7688ee0a10d510aa63b580e724a09d726ef2f671`.
- Dựng bằng `node scripts/worker-telegram-off-build.mjs`, tự dừng nếu Worker Production hoặc mã nguồn đổi.
- Bằng chứng GitHub Actions: https://github.com/mynhforwork-vn/mynh-erp-v5/actions/runs/38233880535
- Artifact chứa `erp-auto-tracking-telegram-off.mjs` và `manifest.json`, lưu tạm 7 ngày.
- Không ghi token, secret hay mật khẩu vào tệp log, manifest hoặc repository.

## Phạm vi thay đổi

1. Trả HTTP 410 cho các endpoint dưới `/telegram/`, bao gồm webhook, setup-webhook, webhook-info, connect-owner, send-once.
2. `runAutomationCycle` chỉ gọi `runTrackingCycle`; không tự chạy `runTelegramNotificationCycle`.
3. Hàm gọi API Telegram được thay bằng stub trả lỗi, không tạo request tới `api.telegram.org`.
4. Health report `notification_mode=IN_APP_ONLY`, Telegram disabled.
5. Giữ nguyên mã nguồn chính của `runTrackingCycle` và `callExistingTrackingProxy`; SHA-256 các đoạn này được so sánh byte-for-byte với Worker gốc.
6. Bản an toàn giai đoạn một vẫn còn một số hàm hỗ trợ Telegram **không được gọi tới**. Chỉ dọn hẳn dead code sau khi kiểm thử đủ ảnh hưởng; không thay đổi logic khác theo phỏng đoán.

## Giới hạn QA

- PASS: cú pháp JavaScript Node 22; các đường dẫn Telegram trả 410 với GET/POST; không có outbound request trong kiểm thử giả lập; health và bảo vệ endpoint `/run-once`; SHA-256 Tracking/proxy không đổi.
- **Chưa PASS**: gọi provider SPX/GHN thật, database persistence Tracking sau triển khai, Cron/Worker route end-to-end, phân quyền với cấu hình binding thật, toàn bộ breakpoint.
- Cloudflare hiện không có cron trigger trực tiếp trên `erp-auto-tracking`, nhưng Worker có các đường gọi HTTP thủ công. Không suy đoán hệ thống không dùng chúng.

## Điều kiện trước phát hành (phải được duyệt rõ)

1. Ghi nhận cấu hình binding/route/cron của Worker đang chạy (đặc biệt `GHN_PROXY`, `SUPABASE_URL`, secret `SUPABASE_SECRET_KEY`, `RUN_TOKEN` và các binding ERP khác) **chỉ bằng tên và loại**, không xuất giá trị secret.
2. Đối chiếu Worker Production lần cuối với hash và version ghim. Nếu khác, dừng phát hành và tạo QA lại.
3. Không deploy chỉ bằng một lệnh `wrangler deploy` chưa kèm đủ cấu hình/binding: có thể ghi đè và làm hỏng Tracking/GHN.
4. Triển khai bản mã đã QA qua cơ chế có kiểm soát, giữ mọi binding cần thiết; chưa được phép thì không chạy.
5. Kiểm tra ngay sau triển khai: `/health`, 410 trên Telegram endpoint, `/run-once` từ chối không có token, SPX/GHN xử lý đúng qua proxy, mapping trạng thái, ghi sự kiện DB, retry, giới hạn polling và giờ nghỉ.
6. Supabase `telegram-alert-dispatcher` cần **một đợt triển khai riêng** sang phiên bản disabled HTTP 410. Hiện chưa thực hiện.
7. Chỉ sau khi tất cả đường gửi được xác minh đã ngừng mới cân nhắc vô hiệu hóa/xóa secret `TELEGRAM_BOT_TOKEN`, theo quyết định riêng. Không xóa toàn Worker hoặc secret trong giai đoạn này.
8. Giữ nguyên `main`, Production ERP và các Worker liên quan cho tới lúc được duyệt. Không tự rollback.

**Quyết định hiện tại:** chờ phê duyệt triển khai theo từng bước.