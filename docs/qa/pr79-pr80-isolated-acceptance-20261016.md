# MYNH ERP V5 — Nghiệm thu tích hợp PR #79 + PR #80, 16/10/2026

## Bất biến
- Main 615fa4dc; nguồn PR #79 c5651bc1; nguồn PR #80 a7f62e13.
- Nhánh QA độc lập: kết hợp mã nguồn PR #79 và đúng ba file sửa UI + hai script QA PR #80.
- Không merge main, kích hoạt Production, chỉnh Cron/Worker tracking, chạy SQL migration hay chỉnh dữ liệu đơn thật.
- Chỉ upload Cloudflare Preview cách ly; CI không có service-role, không tạo tài khoản QA.

## QA tự động
- Static regression PR #79; hợp đồng cảnh báo giao lỗi/hệ thống; PR #80 toast/table; tích hợp; OpenNext build.
- Preview GET /api/health=200, GET /login=200, GET /api/alerts/in-app không JWT=401. Không có giao dịch ghi.
- CI PASS không đồng nghĩa E2E JWT/SQL/Browser đầy đủ.

## Thẩm định migration chờ phê duyệt
- 0070 thay thế get_in_app_alerts để giữ alert giao lỗi còn hiệu lực quá 30 ngày và ưu tiên 100 nhóm.
- 0071 bổ sung 3 rule hệ thống (Telegram=false), system_notification_reads RLS theo user, get_notification_feed và các RPC read/resolve, nguồn sync/UNKNOWN/Cron.
- Kiểm tra chữ ký RPC/grant/owner, SECURITY DEFINER, current_erp_role, loại shipment cancelled/DELIVERED/KHÔNG CÓ, nhóm 40/100, RLS và index/query cost.
- SQL chưa chạy trên Production; hiện Supabase không có nhánh DB staging, không chạy DDL trực tiếp vào Production dù ROLLBACK.

## QA JWT thực sau khi có database cách ly được chấp thuận
1. Admin/Operator/Viewer bằng JWT thật, 401/403, tách read state mỗi user, read/read-all/resolve và persistence qua reload.
2. Trạng thái: DELIVERY_FAILED -> OUT_FOR_DELIVERY vẫn nhắc; read/read-all không tắt; DELIVERED/CANCELLED dừng; >30 ngày vẫn nhắc; giữ lịch sử.
3. Nguồn system: sync FAILED -> SUCCESS; latest UNKNOWN -> mapped; Cron failed -> succeeded; chưa hồi phục thì không được resolve.
4. Truy cập User -> Đơn -> Tracking -> Back qua slidebar, 0/1/2 slidebar, lưu độ rộng cột sau reload và cuộn trong HUB.
5. Toast nhận hàng/chuyển ship/cả hai: một toast góc trái có X, tự ẩn 5s, không tái hiện khi reload; thử ghi và đối soát chỉ với fixture QA.
6. Test các breakpoint Mobile 320/360/390/430; Tablet 768/820/1024; Desktop 1280/1440/1920, không tràn/chồng giao diện.
7. Bảo toàn 5 phút GET frontend, quiet hours 02:00–06:00, 120 phút polling DELIVERY_FAILED, không tăng calls Cloudflare.
8. Thu log Network/HTTP, screenshots, JWT role, DB persistence; làm sạch fixture QA không động dữ liệu thật.

## Release gate
- QA bằng JWT thật và migration trên DB QA phải PASS trước khi trình phê duyệt SQL Production.
- Sau nghiệm thu tích hợp mới trình duyệt merge riêng, phát hành Production riêng.
