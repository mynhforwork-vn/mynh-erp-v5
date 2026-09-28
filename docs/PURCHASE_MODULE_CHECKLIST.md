# MYNH ERP V5 — Nhóm MUA HÀNG

Trạng thái: ĐANG TRIỂN KHAI / baseline functional đã có

## 1. Tổng quan mua hàng
- [x] Bộ lọc Hôm nay / 7 ngày / 30 ngày / Tháng / Quý / Năm / Tùy chọn
- [x] KPI Tổng đơn
- [x] KPI Tổng COD
- [x] KPI Đang vận chuyển
- [x] KPI Giao thành công
- [x] KPI Chờ xác nhận nhận
- [x] KPI Đã nhận
- [x] Tổng hợp theo Khu vực
- [x] Tổng hợp theo Kho đích
- [x] Phân bố trạng thái vận chuyển
- [x] Danh sách đơn cần xử lý
- [x] Luồng Mua hàng → Đơn → Tracking → Nhập kho
- [ ] Visual QA deployment thật

## 2. Tài khoản mua hàng
- [x] Đổi ngữ nghĩa từ Tài khoản Shopee → Tài khoản mua hàng
- [x] Bổ sung platform, mặc định SHOPEE
- [x] Mini KPI trạng thái
- [x] Tìm Username / SĐT / Email
- [x] Lọc Hoạt động / Cần xử lý / Đã khóa / Không xác định
- [x] Bảng đầy đủ thông tin baseline
- [x] Tạo / Chi tiết / Sửa / Lịch sử
- [x] Password / SPC dùng Vault
- [ ] Bulk import
- [ ] Column manager / resize / save layout
- [ ] Visual QA deployment thật

## 3. Đơn nhập hàng
- [x] Đổi ngữ nghĩa thành Đơn nhập hàng
- [x] Bộ lọc Hôm nay / 7 ngày / 30 ngày / Tháng / Tùy chọn
- [x] KPI Tổng đơn / COD / vận chuyển / giao thành công / chờ nhận / chưa MVĐ
- [x] Tìm Mã đơn / MVĐ / Username / sản phẩm / voucher / SĐT
- [x] Lọc Chờ nhận / Đã nhận
- [x] Tạo đơn nhiều sản phẩm / voucher
- [x] Sửa đơn
- [x] Cập nhật MVĐ giữ lịch sử
- [x] Panel Thông tin / Tracking / Lịch sử
- [ ] Visual QA deployment thật

## 4. Cảnh báo vận chuyển
- [x] 4 nhóm cảnh báo chuẩn
- [x] Console nhóm theo Kho đích
- [x] Hiển thị Mã đơn / MVĐ / Sản phẩm / COD / Người nhận / SĐT
- [x] Manual Tracking Sync inline
- [x] Link cập nhật MVĐ / chi tiết
- [x] Lọc theo ngày trạng thái
- [x] Xác nhận nhận từng đơn / nhiều đơn
- [x] Chọn kho nhận
- [x] Receive batch atomic
- [x] RECEIVED → READY_TO_TRANSFER
- [x] Rollback test PASS, không residue
- [ ] Thanh toán shipper (thuộc nhóm Tài chính)
- [ ] Visual QA deployment thật

## Gate tiếp theo
QUẢN LÝ KHO:
1. Tổng quan kho
2. Nhập kho
3. Tồn kho
4. Lịch sử kho
5. Chuyển kho
