# MYNH ERP V5 — Navigation Freeze

Trạng thái: CHỐT

Nguyên tắc:
- Sidebar tổ chức theo luồng nghiệp vụ, không theo tên bảng dữ liệu.
- Không tự ý đổi tên nhóm, gộp/tách menu hoặc thay route nghiệp vụ sau khi freeze nếu chưa có yêu cầu mới.
- Các module hiện có sẽ được remap route/menu nhưng không thay đổi logic nghiệp vụ đã hoàn thành.
- Tổng quan hệ thống sẽ hoàn thiện sau khi các module con ổn định.

## TỔNG QUAN
- Tổng quan hệ thống

## MUA HÀNG
- Tổng quan mua hàng
- Tài khoản mua hàng
- Đơn nhập hàng
- Cảnh báo vận chuyển

### Tổng quan mua hàng
Dashboard nhóm mua hàng:
- Số đơn đặt
- Giá trị COD
- Theo khu vực / kho đích
- Đơn đang vận chuyển
- Đơn giao thành công
- Đơn chờ nhận
- Đơn đã nhận
- Cảnh báo bất thường

### Tài khoản mua hàng
- Hiện tại: Shopee
- Có thể mở rộng nền tảng khác
- Username / SĐT / Email / Password / SPC / thiết bị
- Voucher
- Lịch sử tài khoản
- Số lượng đơn
- Trạng thái tài khoản

### Đơn nhập hàng
- Toàn bộ đơn mua của hệ thống
- User mua
- Sản phẩm / SKU / phân loại
- Giá / COD
- Voucher
- Người nhận
- Khu vực / kho đích
- MVĐ / ĐVVC
- Trạng thái đơn
- Trạng thái thanh toán
- Tracking
- Lịch sử thay đổi
- Tạo / Sửa đơn
- Cập nhật MVĐ

### Cảnh báo vận chuyển
- Console đơn đang vận chuyển
- Đến kho đích
- Đang giao
- Giao thành công
- Giao không thành công
- Hoàn hàng
- Nhóm theo kho đích
- Manual Tracking Sync
- Cập nhật MVĐ
- Xác nhận đã nhận hàng
- Xác nhận từng đơn / hàng loạt / theo ngày
- Nối thanh toán shipper ở bước sau

## QUẢN LÝ KHO
- Tổng quan kho
- Nhập kho
- Tồn kho
- Lịch sử kho
- Chuyển kho (dự phòng, triển khai sau)

### Nhập kho
- Chỉ nhận đơn đã xác nhận nhận hàng
- Kiểm tra sản phẩm / SKU / phân loại / số lượng
- Chọn kho
- Xác nhận nhập kho
- Dự phòng quét QR / camera điện thoại / mobile flow

### Tồn kho
- Theo Kho → SKU → Phân loại
- Số lượng hiện tại
- Giá vốn / giá bán nếu có
- Hàng đang chuyển
- Hàng khả dụng

### Lịch sử kho
- Nhập
- Xuất
- Bán
- Hoàn
- Điều chỉnh
- Chuyển kho
- Người thực hiện / thời gian / chứng từ nguồn

## BÁN HÀNG
- Tổng quan bán hàng
- Đơn bán hàng
- Khách hàng
- Công nợ khách hàng

### Tổng quan bán hàng
- Doanh thu
- Số đơn
- Sản phẩm bán
- Theo ngày / tháng / quý
- Theo SKU
- Theo khách hàng

### Đơn bán hàng
- Khách hàng
- SKU / phân loại
- Số lượng
- Đơn giá
- Thành tiền
- Thanh toán
- Tự động trừ tồn kho

### Khách hàng
- Thông tin khách
- Lịch sử mua
- Tổng doanh số
- Tổng đã thanh toán
- Công nợ hiện tại

### Công nợ khách hàng
- Phát sinh nợ
- Đã thu
- Còn nợ
- Lịch sử thanh toán
- Phân bổ một khoản thanh toán cho nhiều đơn

## TÀI CHÍNH
- Tổng quan tài chính
- Thu / Chi
- Thanh toán Shipper
- Thanh toán khách hàng
- Báo cáo tài chính

### Tổng quan tài chính
- Tổng thu
- Tổng chi
- Dòng tiền
- Công nợ phải thu
- Chi mua hàng
- Chi shipper
- Lợi nhuận sơ bộ

### Thu / Chi
- Phiếu thu
- Phiếu chi
- Nhóm khoản
- Nguồn phát sinh
- Chứng từ liên quan

### Thanh toán Shipper
- Chỉ đơn đã RECEIVED
- Chọn nhiều đơn
- Tổng COD tự tính
- Nhập số tiền thực chuyển
- Tip = tiền thực chuyển - tổng COD
- Lịch sử các đợt thanh toán

### Thanh toán khách hàng
- Nhận tiền khách
- Phân bổ vào công nợ
- Thanh toán một phần / toàn bộ
- Lịch sử thanh toán

### Báo cáo tài chính
- Doanh thu
- Chi phí
- Dòng tiền
- Theo ngày / tháng / quý / năm
- Theo kho
- Theo nhóm nghiệp vụ

## Route remap dự kiến
- / → Tổng quan hệ thống
- /purchase → Tổng quan mua hàng
- /purchase/accounts → Tài khoản mua hàng
- /purchase/orders → Đơn nhập hàng
- /purchase/tracking → Cảnh báo vận chuyển
- /warehouse → Tổng quan kho
- /warehouse/receive → Nhập kho
- /warehouse/inventory → Tồn kho
- /warehouse/history → Lịch sử kho
- /warehouse/transfers → Chuyển kho
- /sales → Tổng quan bán hàng
- /sales/orders → Đơn bán hàng
- /sales/customers → Khách hàng
- /sales/debt → Công nợ khách hàng
- /finance → Tổng quan tài chính
- /finance/cashflow → Thu / Chi
- /finance/shipper-payments → Thanh toán Shipper
- /finance/customer-payments → Thanh toán khách hàng
- /finance/reports → Báo cáo tài chính

Legacy route /users, /orders, /tracking sẽ được remap có redirect tương thích trong giai đoạn chuyển đổi.
