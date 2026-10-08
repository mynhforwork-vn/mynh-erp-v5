# MYNH ERP V5 — Desktop UX V1: Pre-merge release audit

**Nguồn duy nhất đã chốt:** `fix/desktop-polish-v1`.
**Preview:** https://desktop-polish-v1-mynh-erp-v5.mynh-forwork.workers.dev/purchase/orders?range=all
**Đích phát hành:** `main` (production chưa được thay đổi).
**Trạng thái:** chỉ xem xét qua Draft PR; **không merge khi còn ô kiểm tra chưa đạt**.

## 1. Khóa UX Desktop, không tự mở rộng phạm vi

- Giữ giao diện đã chốt trên Desktop: KPI, bộ lọc ngày, sidebar, slidebar ngữ cảnh, bảng/HUB, kéo/ẩn/hiện/sắp xếp cột, màu cảnh báo HUB theo `urgentCount`.
- Không thay hình thức bên ngoài chỉ để sửa bài kiểm thử.
- **Không phát hành Mobile:** loại Mobile App UI, header/bottom navigation, dedicated Mobile stylesheet/QA, các mobile-only card/list và POS cart bar khỏi nhánh Desktop trước merge; không thay đổi luồng Desktop.
- Việc tạo PR không đồng nghĩa được phép deploy `main`.

## 2. Phạm vi chênh lệch với main

Tại lần audit 08/10/2026, nhánh đi trước `main` nhiều commit nên phải review **diff file cuối**, không chỉ xem tiêu đề commit.

| Nhóm | File / ảnh hưởng | Điều kiện merge |
|---|---|---|
| UX Desktop | `app/(erp)/*`, `components/*table*`, `components/tracking-hub-group.tsx`, `app/styles/brand-responsive-v1.css`, `desktop-kpi-contract-v3.css` | Desktop browser QA PASS |
| POS / Bán hàng | `components/sales-pos-workspace.tsx`, `lib/actions/sales.ts` | Test tạo POS, quản lý phân loại, xóa phân loại và xác minh quyền |
| Tài chính | `app/(erp)/finance/*`, `components/finance-*table.tsx`, `lib/finance-period.ts` | So sánh KPI, lọc ngày, đối soát, chứng từ và tiền |
| Điều hướng ngữ cảnh | `components/context-order-panel.tsx`, `context-sale-panel.tsx`, `system-slidebar.tsx` | Mở/đóng/Back không đổi tab; không tràn |
| Mobile (loại khỏi bản phát hành) | Đã bỏ `mobile-app-nav.tsx`, `mobile-remediation.css`, `mobile-full-qa.mjs` và CSS mobile dưới 901px của Brand Responsive | Không tái nhập Mobile UX, không làm thay đổi desktop >=901px |
| Database | `0008_add_purchase_account_devices.sql`, `0035_seed_finance_demo_data.sql` | Không có INSERT DEMO trong migration; schema/RLS giữ nguyên |
| QA + CI | `scripts/*qa*`, `.github/workflows/*` | Build, Preview, Desktop QA đều PASS đúng HEAD commit |

**Thay đổi logic cần review thủ công:** `lib/actions/sales.ts` bổ sung xóa phân loại sản phẩm, có thao tác tháo liên kết sản phẩm rồi xóa phân loại. Không được xem đây là thay đổi CSS đơn thuần. `lib/erp-date-range.ts` và `lib/finance-period.ts` ảnh hưởng tới bộ lọc thời gian/KPI.

## 3. Quy tắc dữ liệu demo

- Không xóa các User, Đơn, Sản phẩm, Kho hay cấu hình nghiệp vụ chỉ dựa vào ngày tạo, vì có thể là dữ liệu thật.
- Đã rà soát Supabase V5: không có bản ghi business được gắn marker `DEMO` / `QA_BROWSER_FIXTURE` ở thời điểm kiểm tra; không gọi RPC reset vận hành.
- Migration `0008`: **giữ DDL + RLS**, bỏ chèn 11 thiết bị DEMO.
- Migration `0035`: **no-op**, không còn chèn khách hàng, POS, phiếu thu/chi DEMO.
- Script `remediation-static-qa.mjs` chặn tái tạo mẫu khi migrations chứa INSERT với marker DEMO/QA.
- **Lưu ý lịch sử:** migration đã áp dụng trong Supabase không bị chạy lại hoặc rollback vì sửa file Git. Nếu sau này cần rebuild từ đầu, phải kiểm tra tương thích version/schema và checksum bằng migration runner tương ứng.

## 4. Cổng chặn trước merge

- [ ] Remediation static + Next.js build PASS trên HEAD.
- [ ] Cloudflare isolated Preview PASS trên HEAD; Health/Login PASS.
- [ ] Desktop Slidebar QA: phải, bảng, trái và cleanup fixture đều PASS trên HEAD.
- [ ] Browser QA nghiệp vụ trọng yếu: Orders, Tracking, Kho, POS, Finance, role/bảo vệ thao tác xóa được kiểm tra bằng dữ liệu cô lập. **POS và Tài chính được người dùng duyệt UX, không miễn kiểm thử chức năng.**
- [x] **Loại Mobile App UX khỏi release** theo quyết định người dùng. Mobile không còn là phần được đề xuất vào `main`; không triển khai thêm Mobile trong đợt này.
- [ ] Data: không còn marker DEMO/QA sau QA cleanup; không xóa dữ liệu vận hành thực.
- [ ] Kiểm tra phân quyền đối với `SECURITY DEFINER` RPC và xóa phân loại POS.
- [ ] Người dùng đồng ý phát hành. Chỉ sau đó mới đánh dấu PR ready và merge `main`.

## 5. Rollout và rollback

- Không chạy migration reset / seed tại bước phát hành UX; không xóa cấu hình HUB, tracking, Telegram, ngân hàng.
- Kiểm tra đường dẫn Đơn nhập, Cảnh báo vận chuyển, POS, Thu/Chi trước và ngay sau merge.
- Bảo lưu SHA `main` trước merge để có thể rollback code qua revert nếu phát hiện lỗi; revert code **không tự rollback dữ liệu**.
- Không lập lại Mobile App UI trong đợt release này; nếu sau này cần hỗ trợ điện thoại sẽ phải xác định phạm vi và nghiệm thu riêng.

## 6. Quyết định phạm vi (08/10/2026)

- POS: **đã duyệt UX**.
- Tài chính: **đã duyệt UX**.
- Mobile: **không thêm vào main**. Đã gỡ bộ điều hướng/UX Mobile khỏi nhánh Desktop trước merge. Các responsive rule cũ thuộc code nền không được xem là một giao diện Mobile đã nghiệm thu.
- Vẫn phải PASS Browser QA + Mutation/RBAC + Desktop QA trên commit sau khi loại Mobile mới được đề xuất merge.
