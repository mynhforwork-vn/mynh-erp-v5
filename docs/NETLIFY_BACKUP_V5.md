# MYNH ERP V5 — Website dự phòng trên Netlify

Đây là nhánh triển khai **dự phòng độc lập với Cloudflare Workers**.
Mã nguồn dùng chung GitHub. Dữ liệu nghiệp vụ dùng chung Supabase V5
(`nvgxwqapfaslavhtpauh`), **không tạo DB mới và không copy dữ liệu**.

## Tạo website backup

1. Đăng nhập Netlify và chọn **Add new project → Import an existing project → GitHub**.
2. Chọn repository `mynhforwork-vn/mynh-erp-v5`.
3. Production branch: `deploy/netlify-v5-backup`.
4. Framework Next.js; Build command `npm run build`; Publish directory `.next`; Node.js 22.
   Netlify tự phát hiện Next.js và tích hợp OpenNext — **không xuất static**.
5. Ở **Environment variables**, đặt:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL của dự án Supabase V5 hiện dùng.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key của Supabase V5.
   Không nhập service-role key hoặc mật khẩu vào mã nguồn/repository.
6. Deploy site. Lấy URL `https://<ten-site>.netlify.app` từ Netlify Dashboard.
7. Thử `/api/health` (JSON `"ok":true`), `/login`, đăng nhập ERP,
   xem đơn nhập/kho/POS và thử các thao tác với **bản ghi QA cô lập**.
   Không sử dụng chứng từ thật cho bài kiểm thử xóa/hủy.
8. Kiểm tra session/redirect Supabase trên hostname Netlify mới trước khi
   coi đây là website backup đã sẵn sàng.

## Quy tắc vận hành

- Khi Cloudflare 1027, truy cập bằng tên miền `*.netlify.app` độc lập với
  Workers; không cần trỏ qua Cloudflare.
- Website backup dùng **chung database thật**. Mọi thao tác ghi sẽ xuất hiện
  ở cả hai website, nên không chạy thử reset hoặc xóa hàng loạt trên dữ liệu thật.
- Cookies đăng nhập là theo hostname: có thể phải đăng nhập lại trên Netlify.
- Không chạy thêm Tracking scheduler/Telegram dispatcher song song từ Netlify.
  Các luồng tracking phụ thuộc Worker Cloudflare **không tự hồi phục** chỉ vì
  giao diện ERP đã hoạt động trên Netlify.
- Netlify Free có hạn mức credit hàng tháng. Theo dõi Usage & Billing;
  nếu hết hạn mức Netlify cũng có thể gián đoạn.
- Khi cập nhật `main`, kiểm tra tương thích/migration trước khi đưa cùng commit
  lên nhánh backup; không tự động merge nhánh chưa QA.

## Giới hạn cần nghiệm thu

Build Next.js trên GitHub chỉ xác nhận mã nguồn compile được; Netlify Runtime
phải được kiểm tra riêng: đăng nhập Supabase, auth refresh, Server Actions,
xử lý POS, kho, quyền truy cập, và tải trang điều hướng.

Dự án Netlify không thể tạo chỉ bằng GitHub nếu chưa cấp quyền Netlify hoặc
kết nối repository ở Netlify Dashboard. Không được xem cấu hình này là
URL dự phòng đã hoạt động trước khi bước Deploy và Smoke Test thực tế PASS.
