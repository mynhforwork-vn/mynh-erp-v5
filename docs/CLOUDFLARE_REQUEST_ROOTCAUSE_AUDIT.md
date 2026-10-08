# MYNH ERP V5 — kiểm toán request Cloudflare (09/10/2026)

## Mục tiêu
Khoanh vùng nguồn ~132.000 request/ngày được ghi nhận tại Cloudflare `mynh-erp-v5`, **trước khi** quyết định chặn bot, đổi API, gộp PR #54 hoặc PR #53.

## Các phép đo bắt buộc
1. **Theo Worker và giờ UTC:** so sánh `mynh-erp-v5`, `erp-auto-tracking`, `ghn-proxy`, `mynh-erp-notify-v1`, Worker cũ `mynh-erp`. Báo cáo `requests`, `errors`, `subrequests`; tìm giờ cao điểm bất thường.
2. **Theo đường dẫn:** Cloudflare Dashboard → Workers & Pages → `mynh-erp-v5` → Observability → Query Builder. Chọn dữ liệu Workers Logs, thống kê **Count** theo `$workers.event.request.path` (sắp xếp giảm dần). Xem 20 path hàng đầu.
3. **Theo mã phản hồi:** Count nhóm theo `$workers.event.response.status` và `$workers.event.request.path`; đặc biệt 429/403/404/5xx. Lưu ý 429/1027 bị chặn trước Worker có thể không xuất hiện trong Workers invocation logs.
4. **Theo nguồn:** Count nhóm theo `$workers.event.request.cf.country` (nếu có); đối chiếu user-agent hoặc ASN trong UI **chỉ theo nhóm** nếu trường có sẵn. Không tải về hay gửi IP cá nhân, Cookie, Authorization.
5. **Theo hành vi:** phân loại GET trang, Next.js RSC `?_rsc` (chỉ kiểm tra trong dashboard, không lưu query), POST Server Actions, `/api/alerts/in-app`, `/api/tracking/manual`, `/api/health`, trang đăng nhập, file static.

## Trình tự thực hiện
- Trong Observability, chọn 24 giờ gần nhất hoặc ngày UTC bị spike. Query Builder có các trường dùng được trong hướng dẫn Cloudflare (tham khảo links bên dưới).
- Chạy lần lượt thống kê Count / Group By / Sort desc / Limit 20 cho path, status, country. Lưu tổng số lượt, tỷ lệ %, giờ cao điểm; không chép danh sách URL có tham số nhạy cảm vào PR công khai.
- Đối chiếu tổng Log events với `workersInvocationsAdaptive.sum.requests`. Logs có thể lấy mẫu, giữ được 3 ngày trên Workers Free (tại thời điểm 09/10/2026), nên **không coi số log là toàn bộ request nếu sampling khác 100%**.
- Xác định top path chiếm đa số request và nguồn: `/api/alerts/in-app` → tối ưu polling; RSC / navigation → điều tra tải lại; `/api/health` → giám sát bên ngoài; các path lạ → bot/scan; `/login` → automation.
- Ưu tiên kiểm tra quy tắc 5 phút/request ngoài giờ nghỉ, nghỉ 02:00–06:00 và chỉ gọi khi Tracking bật trong PR #54/#53; **không nhầm với lưu lượng Production trước merge**.
- Chỉ sau khi có số liệu hãy lập biện pháp giảm tải theo path/đối tượng và triển khai Preview, QA, đo lại traffic trước merge.

## Quyền và hạn chế kiểm toán
- Workflow `.github/workflows/cloudflare-request-rootcause-audit.yml` chỉ gọi API **đọc** Analytics và kiểm tra khả năng sử dụng Observability; không deploy hay thay Cloudflare.
- `wrangler.jsonc` trên main đã có `observability.enabled=true`; Workers Logs mặc định bao gồm invocation với URL/status. Không cần thêm `console.log` cho mỗi request hoặc ghi log vào Supabase (việc này tạo tải phụ).
- Token GitHub trước đây gọi `POST /accounts/{id}/workers/observability/telemetry/keys` trả **403**. Nếu vẫn 403, cần cấp quyền Workers Observability phù hợp hoặc đọc Query Builder từ giao diện Dashboard. Không dùng Global API Key gửi vào chat.
- Mã nguồn chỉ thay đổi trên nhánh `audit/cloudflare-workers-v5`. Không merge nhánh audit, không tự xóa Worker, không thay đổi `main`, database, Preview gốc, PR #53/#54.

## Báo cáo PASS
Có thể quyết định xử lý khi bảng có:
| Worker | Giờ UTC | Phân hệ/path nhóm | Mã HTTP | Quốc gia nhóm | Số request | Tỷ trọng | Hành động khuyến nghị |
|---|---|---|---|---|---:|---:|---|
| mynh-erp-v5 | ... | ... | ... | ... | ... | ... | ... |

**Tài liệu Cloudflare:**
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/workers/observability/query-builder/
- https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/keys/
