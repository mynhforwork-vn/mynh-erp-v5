# MYNH ERP V5 / PR #81 — Supabase QA chạy cục bộ, không phí Cloud

Đây là bộ kiểm thử riêng cho SQL thông báo 0070/0071. Không sao chép ERP Production; không thay thế nghiệm thu giao dịch nhận hàng/chuyển ship trên schema đầy đủ.

## Điều kiện
- Cần Docker đang hoạt động, Supabase CLI và Node.js 22+ trên máy người kiểm thử; Docker phải tải được ảnh từ registry.
- Không cần tài khoản Supabase trả phí, token hoặc mật khẩu Production.
- Repo thiếu supabase/config.toml và baseline schema đầy đủ; các migration dùng số 4 chữ số, không phải tên timestamp thông thường. Không chạy supabase db reset ở repo gốc.
- Script tạo local project tạm trong /tmp, khởi tạo schema fixture tối thiểu, thực thi đúng SQL 0070 + 0071 bằng psql trong container cục bộ.
- Không dùng supabase link, supabase db push/pull, Cloudflare, GitHub Actions hay dịch vụ tính phí. Token môi trường Production bị unset.
- Script từ chối địa chỉ API Supabase khác localhost, 127.0.0.1 hoặc ::1.

## Chạy
Checkout đúng HEAD PR #81 và chạy trên máy đã cài Docker:
  docker info
  supabase --version
  node --version
  bash scripts/qa/pr81-local-supabase.sh

Bộ lệnh khởi tạo project local tạm, chạy migration + Auth JWT + RPC, rồi dừng và dọn local containers/temp data. Mọi lỗi trả exit nonzero và không giả lập PASS. Không gửi token vào log.

## Kiểm thử qua JWT thực do Auth local ký
1. Tạo và đăng nhập Admin/Operator/Viewer trong Supabase Auth local.
2. Admin thấy hệ thống FAILED + UNKNOWN; Viewer không được xem/đánh dấu.
3. Admin không thể ghi trực tiếp vào system_notification_reads để bypass RPC.
4. Admin đánh dấu đọc -> persistence; Operator vẫn chưa đọc (phân quyền từng user).
5. Không thể resolve khi nguồn lỗi còn tồn tại.
6. Operator mark-all không xóa các lỗi còn cần xử lý.
7. DELIVERY_FAILED 40 ngày vẫn xuất hiện khi chưa thành công/hủy; DELIVERED/CANCELLED thì ngừng.
8. SUCCESS và trạng thái mapped tự làm sạch thông báo hệ thống.

## Giới hạn
- JWT là JWT ký thật nhưng của Auth local; không phải phiên Production.
- Đây là fixture tối thiểu, không tái lập hết bảng/triggers/RLS/schema ERP, nghiệp vụ nhận hàng/chuyển ship hay hiệu năng Production.
- Công cụ hiện tại của ChatGPT không có Docker/PostgreSQL server, nên chưa có kết quả chạy thực tế. PASS của static audit không được thay cho chạy local.
- Không chạy migration 0070/0071 trên Production khi chưa phê duyệt riêng.
- Trường hợp CLI, Docker images, pg_cron hoặc schema reload lỗi: báo FAIL và sửa môi trường local; không chuyển sang Cloud Production.

## Quyết định chi phí
Người dùng chưa chấp thuận 0.01344 USD/giờ để tạo Supabase Cloud QA. Bộ kit này không tạo Supabase Cloud branch hoặc dịch vụ tính phí. PR #81 vẫn Draft.

## Lưu ý PostgREST
- Sau khi áp dụng 0070/0071 bằng psql, script chủ động gửi NOTIFY pgrst reload schema và kiểm tra chữ ký hai RPC trên DB local. Điều này tránh báo lỗi thiếu RPC do schema cache chưa làm mới.
