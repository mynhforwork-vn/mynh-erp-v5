# MYNH ERP V5 — Local Staging QA — Option 1

Ngày kiểm thử: 28/09/2026

## Phạm vi
Bản staging local được tách từ source V5 hiện có để tiếp tục phát triển trong lúc Floot chạm giới hạn build theo ngày. Không thay đổi Supabase production hoặc project cũ.

## Đã áp dụng
- Design Freeze Option 1: Dense Rounded Enterprise.
- Font Inter duy nhất.
- Navy `#22324A`, blue `#365072`, nền `#F5F7FA`, card trắng.
- Sidebar navy, active state xanh thương hiệu.
- Button/input/card/table/panel đồng bộ radius và spacing.
- UI chính Việt hóa: Đăng nhập, Tổng quan, Tài khoản Shopee, Đơn hàng, Vận chuyển, Kho, Tài khoản hệ thống.
- Dashboard đã nâng thành màn vận hành mật độ cao với hàng lệnh, KPI, bảng đơn cần xử lý, cảnh báo và tổng hợp.
- Đã bổ sung đổi mật khẩu trong hệ thống.
- Chuẩn ngày giờ `DD/MM/YYYY HH:mm`.
- Chuẩn tiền `658.000 đ`.
- Chuẩn SĐT `0986 221 804`; đầu vào `+84` được hiển thị về số nội địa.
- Enum kỹ thuật được ánh xạ sang nhãn tiếng Việt.

## Kiểm thử source
- TypeScript/TSX parser: 23 file, 0 lỗi cú pháp/JSX.
- Full `tsc --noEmit` chưa thể chạy vì staging không có `node_modules`; lỗi thu được là thiếu type/module Next/React/Supabase, không phải lỗi cú pháp của thay đổi Option 1.

## Kiểm thử formatter
10/10 PASS:
- `2026-09-28T08:05:00Z` → `28/09/2026 15:05`.
- Ngày → `28/09/2026`.
- Giờ → `15:05`.
- `0986221804` → `0986 221 804`.
- `+84986221804` → `0986 221 804`.
- `658000` → `658.000 đ`.
- `OUT_FOR_DELIVERY` → `Đang giao hàng`.
- `admin` → `Quản trị viên`.
- `MANUAL` → `Thủ công`.
- `DELIVERED` alert → `Giao hàng thành công`.

## Rà ngôn ngữ UI
Không còn các nhãn cũ như `V5 GREENFIELD`, `Tracking Console`, `Tracking active`, `User Shopee`, `Manual Sync`, `Shipment đang`, `Carrier DELIVERED`, `Tạo Order` trong mã giao diện chính.
Các tên bảng/cột/backend kỹ thuật vẫn giữ nguyên trong truy vấn và code, không hiển thị cho người dùng.

## Kiểm thử visual
Đã tạo `docs/option1-preview.html` để mô phỏng Dashboard + bảng + panel phải bằng chính CSS staging.
Container hiện chặn browser automation truy cập `file://` và `localhost`, nên chưa thể xác nhận screenshot bằng trình duyệt local. Bước visual regression sẽ chạy lại trên Floot ngay khi quota reset.

## Bước đồng bộ Floot khi quota mở
1. Chụp lại trạng thái Floot hiện tại/checkpoint.
2. Đồng bộ formatter, typography, palette và text từ staging local.
3. Typecheck Floot.
4. Preview 1440×900 và 2560×1600.
5. Rà Login/Tổng quan/Tài khoản Shopee/Đơn hàng/Vận chuyển/Kho.
6. Publish production.
7. Regression test Auth/RLS/Manual tracking sync.
