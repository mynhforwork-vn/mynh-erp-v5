# Báo cáo nghiệm thu trước phát hành — Tracking SPX/GHN và dừng Telegram

Ngày đối chiếu: 12/10/2026 (Asia/Bangkok). **Chỉ đọc và kiểm thử giả lập; không gọi provider, không thay đổi dữ liệu.**

## Phạm vi và bản chuẩn

- ERP `main`: `ceaf9f500c20689fa7d4a52e64cfc7c6c09f2254`.
- PR #64: ứng viên giao diện thông báo chỉ trong ứng dụng, Draft. PR #65: ứng viên Worker không Telegram, Draft.
- Worker ERP Production: `mynh-erp-v5`, version `a67c106a-c587-4108-9827-db6e711081fe`.
- Tracking Worker Production: `erp-auto-tracking`, version `6f26895d-5af0-43dc-978a-b761d7c39dd8`.
- GHN Proxy Production: `ghn-proxy`, version `619f6ffe-6e19-46b0-99cd-0a491fd5be3b`.
- Worker QA `erp-auto-tracking-telegramoff-qa-v1` hoạt động riêng và không chứa credential hoặc service binding dữ liệu thật.

## SPX — bằng chứng hoạt động

- Provider Supabase: `SPX` enabled, adapter `SPX_PUBLIC`, GET, timeout 10 giây.
- Có 26 shipment SPX Express, trong đó 10 shipment active và bật Tracking.
- Trong 24 giờ kiểm tra: nhật ký `tracking_sync_logs` có 77 lần AUTO SUCCESS và 9 MANUAL SUCCESS, không có bản ghi lỗi trong các nhóm trên.
- Trong 24 giờ kiểm tra: 105 `tracking_events` từ `CARRIER`, đa trạng thái (IN_TRANSIT, HUB, OUT_FOR_DELIVERY, DELIVERED...).
- Đây là bằng chứng **SPX thực tế đang ghi nhận Tracking** trên môi trường hiện hành. Không chứng minh bản Worker ứng viên đã kết nối thật sau triển khai.

## GHN — BLOCKER chưa nghiệm thu

- Có carrier `GHN` đang được liệt kê trong `shipping_carrier_configs`, nhưng **không có provider GHN enabled trong `tracking_provider_configs`** và chưa có shipment GHN để kiểm chứng E2E.
- Worker `erp-auto-tracking` có binding `GHN_PROXY` trỏ tới `ghn-proxy`. Đây là bằng chứng **đường code và service binding tồn tại**, không phải bằng chứng đồng bộ thật.
- Mã `ghn-proxy` khai báo header `token: "[object Object]"` (chuỗi ký tự). Cần xác minh hợp đồng public GHN và phương án xác thực hợp lệ, không tự điền token không rõ nguồn hoặc kích hoạt provider.
- QA mô phỏng đã xác nhận GHN chuyển `order_code` / `phone_verify` qua POST và fallback GET; mọi `fetch` ra SPX/GHN được mock, không gửi thật.
- Chỉ khi có shipment GHN hợp lệ và cấu hình provider rõ ràng mới kiểm tra status mapping, retry, journal, persistence sau reload và ủy quyền của các vai trò. Việc kích hoạt provider hoặc tạo đơn thật cần phê duyệt riêng.

## Polling và bảo vệ dữ liệu

- Supabase cron `mynh-v5-tracking-dispatcher` đang active với biểu thức `* * * * *` (chu kỳ gọi bộ điều phối, **không phải tần suất gọi API mỗi vận đơn**).
- `tracking_runtime_settings`: bật auto, quiet hours **02:00–06:00** Asia/Bangkok, retry **10/30/60 phút**.
- Quy tắc thực tế: READY_TO_SHIP 240 phút; IN_TRANSIT/HUB 120 phút; OUT_FOR_DELIVERY 60 phút; trạng thái terminal tắt auto. Không thay đổi bất cứ mốc nào.
- `claim_due_shipments` kiểm tra điều kiện vận đơn đang hoạt động, provider khả dụng, trạng thái, `next_track_at`, lock; dùng `FOR UPDATE SKIP LOCKED` và giới hạn lô.
- Một shipment chưa có carrier/mã vận đơn hợp lệ vẫn có lịch quá hạn; **bộ claim hiện loại trừ trường hợp này**, nhưng cần đề xuất dọn dữ liệu sau khi được duyệt. Không cập nhật DB trong đợt audit này.
- Edge `tracking-dispatcher` Production version 6 (đang ACTIVE) **khác tệp trong GitHub**: mã GitHub đã bổ sung guard cho placeholder `"KHÔNG CÓ"` trước khi tạo nhật ký/đồng bộ; không tự deploy đè Edge Production khi xử lý Telegram.

## Rà soát binding/route trước khi thay Worker

Đối chiếu đầy đủ **tên và loại binding**, không đọc hoặc ghi giá trị:

| Binding | Type | Ghi chú |
| --- | --- | --- |
| AI | ai | Giữ |
| GHN_PROXY | service | Trỏ `ghn-proxy`, bắt buộc giữ |
| OPENAI_API_KEY | secret_text | Giữ |
| RUN_TOKEN | secret_text | Giữ |
| SHOPEE_CREDENTIAL_KEY | plain_text | Giữ |
| SHOPEE_SECRETS_KEY | secret_text | Giữ |
| SUPABASE_PUBLISHABLE_KEY | plain_text | Giữ |
| SUPABASE_SECRET_KEY | secret_text | Giữ |
| SUPABASE_URL | plain_text | Giữ |
| TELEGRAM_BOT_TOKEN | secret_text | Chỉ xem xét gỡ sau khi toàn bộ đường gửi đã ngừng và có phê duyệt |

- Cloudflare `erp-auto-tracking` hiện không có Cron Trigger trực tiếp; Supabase cron vẫn đang active.
- Không dùng bản Preview **không có binding** để thay trực tiếp vào Production.
- Khi phát hành, kiểm tra route, bindings và version ngay trước và sau deploy; nếu baseline thay đổi, dừng. Không tự rollback.

## Telegram Edge Function — BLOCKER trước phát hành

- Supabase `telegram-alert-dispatcher` Production version **5**, trạng thái ACTIVE, `verify_jwt=false`; code vẫn chứa `api.telegram.org` và đường xử lý gửi thủ công.
- Cấu hình hiện hành: `telegram_alert_settings.enabled=false`, 0 rule Telegram bật, cron `mynh-v5-telegram-alert-dispatcher` inactive, cảnh báo in-app 5/5 bật.
- Tệp nguồn ứng viên `supabase/functions/telegram-alert-dispatcher/index.ts` đã chuyển thành handler HTTP **410** không gọi bot, không đọc token, không claim alerts.
- **Chưa deploy handler 410**: phải được duyệt riêng, triển khai chỉ function Telegram, không đụng `tracking-dispatcher`. Sau triển khai, kiểm tra status 410 cho cả GET/POST, cron không tự bật lại, số rule in-app và event tồn tại, không còn request Telegram ngoài ý muốn.
- Không xóa Edge Function/secret/bảng lịch sử trong đợt kiểm tra này.

## Bằng chứng QA

- [Cloudflare Preview Worker không Telegram — 17/17 HTTP PASS](https://github.com/mynhforwork-vn/mynh-erp-v5/actions/runs/38236580740).
- [Tracking read-only và binding preflight](https://github.com/mynhforwork-vn/mynh-erp-v5/actions/runs/38238385746): 8/8 kiểm tra, 2 blocker, 1 mục chưa xác minh; mô phỏng proxy 6/6, tất cả lời gọi bị chặn.
- Giới hạn: chưa thực hiện E2E GHN thật; không gọi SPX/GHN trong bài mô phỏng; chưa deploy Edge Function hoặc Worker Production.

## Điều kiện phát hành cuối cùng

1. Có phương án xử lý hợp đồng và cấu hình GHN hoặc chấp nhận GHN **chưa đạt** như một hạng mục bị chặn; tuyệt đối không báo GHN PASS.
2. Không sửa polling/quiet hours, không tạo request trùng, không bật Telegram trở lại.
3. Kiểm tra đầy đủ 10 binding, route, Cron, bảo vệ secrets và baseline version/hash trước khi triển khai.
4. Được phê duyệt riêng cho thay thế `telegram-alert-dispatcher`, rồi cho thay `erp-auto-tracking` và deploy ERP.
5. Sau từng thao tác, kiểm tra HTTP 410, SPX thực tế, ghi DB, RBAC, in-app notifications, persistence/reload, các tình huống lỗi.
6. Không tự merge `main`, deploy, rollback, xóa dữ liệu hoặc secret khi chưa được duyệt.

**Kết luận:** Read-only preflight và proxy mock PASS theo phạm vi, **release gate chưa PASS do GHN và Telegram Production chưa hoàn tất**.
