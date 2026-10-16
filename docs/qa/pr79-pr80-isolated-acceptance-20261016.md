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

## Rà soát bảo mật không tốn phí — 16/10/2026
- Phát hiện: SQL 0071 trước đây GRANT SELECT,INSERT,UPDATE trên system_notification_reads cho authenticated. RLS chỉ chặn sửa dữ liệu người khác, không chặn Viewer giả mạo read state của chính mình hoặc Admin/Operator ghi resolved_at khi lỗi đang tồn tại, vượt qua kiểm tra RPC.
- Sửa trong PR #81 (chưa triển khai): bỏ mọi GRANT trực tiếp vào bảng; thao tác ghi/đọc qua public RPC có xác thực + phân quyền Admin/Operator và private.active_system_notifications. Giữ RLS per-user để phòng vệ sâu.
- Kiểm thử tĩnh thêm: kiểm tra direct grant không còn, toàn bộ RPC giữ auth/role gate, hàm private không cho anon/authenticated execute trực tiếp, SQL không thay Cron/Telegram.
- Phát hiện khác chưa nghiệm thu: resolve_system_notification chỉ nhận thông báo nguồn đã hết lỗi, nhưng feed hiện tại chỉ trả nguồn đang lỗi nên UI không có luồng xem/xử lý lịch sử sau hồi phục. Cần chốt nghiệp vụ đã xử lý trước release; không tuyên bố PASS.
- Supabase QA có báo phí 0.01344 USD/giờ và người dùng chưa phê duyệt. Không tạo DB QA, không chạy SQL 0070/0071 trên Production. JWT/RLS/persistence và QA Browser tích hợp để trạng thái CHƯA XÁC MINH.
- Commit [skip ci] nhằm tránh kích hoạt lại GitHub Actions và Cloudflare Preview trong đợt rà soát không phát sinh chi phí. Test mới sẽ chạy cùng workflow tích hợp khi được chấp thuận kiểm thử hạ tầng.

## QA cục bộ thay thế tài nguyên Supabase Cloud tính phí (16/10/2026)
- Người dùng đồng ý phương án Supabase CLI + Docker trên máy local; vẫn không đồng ý tạo branch Supabase Cloud tính phí.
- Repository không có config.toml hoặc một baseline DB đầy đủ; các migration lịch sử đánh số bốn chữ số. Do vậy chạy lại tất cả migration tự động bằng db reset không phải cách tái hiện Production.
- Đã chuẩn bị fixture tối thiểu và script disposable để kiểm thử đúng 0070/0071 và JWT được Supabase Auth local ký, không dùng secrets Production. Xem docs/qa/pr81-local-supabase-readme.md.
- Môi trường chạy công cụ hiện tại không có Docker/Podman/PostgreSQL và không có mạng lấy image; không được báo những kiểm thử này đã PASS cho tới khi có bằng chứng thực thi trên máy có Docker.
- Chỉ có thể nghiệm thu thông báo SQL 0070/0071 trên fixture cục bộ. Kiểm thử nghiệp vụ nhận hàng, chuyển ship, đầy đủ schema và UI responsive vẫn CHƯA XÁC MINH.
