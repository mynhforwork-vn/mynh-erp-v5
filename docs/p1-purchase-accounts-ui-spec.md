# P1 — Tài khoản mua hàng · yêu cầu đã chốt và nghiệm thu

Cơ sở: MYNH ERP V5 Table UI Standard P0 (PR #60), Tracking HUB đã nghiệm thu (PR #59). Triển khai trong Draft PR #61; **không thay đổi Production/DB**.

## 1. Phạm vi

- **Màn:** `/purchase/accounts` gồm danh sách, bộ lọc, menu Cột và slidebar chi tiết User.
- **Giữ nguyên:** nghiệp vụ tạo/sửa User, SKU, đơn nhập, quyền admin/operator, lưu trữ/khôi phục, số liệu KPI và đường dẫn User → Đơn → Tracking → Back.
- **Không sửa schema, migration, Supabase rows.** Thời gian tạo hiển thị được suy diễn từ ngày đặt đơn sớm nhất, thời gian gốc `erp_users.created_at` bất biến.
- Không thay CSS/logic của bảng Tracking, Kho, POS, Tài chính; không bật resize ở bảng trước đó đã tắt.

## 2. Đặc tả giao diện

| Vùng | Quy tắc |
|---|---|
| STT | ~33 px, canh giữa, không tăng do thứ tự/ẩn cột |
| Checkbox | ~32 px, chỉ khi có quyền thao tác |
| Username | ~148 px, cắt chữ có tooltip; nút tạo đơn chỉ hiển thị `+` (có tiêu đề truy cập) |
| Nền tảng | ~80 px; chip nhỏ |
| SĐT | ~112 px; một dòng |
| Email | ~145 px; rút gọn, có title |
| Trạng thái | ~102 px; pill vừa nội dung, không che ô kế |
| Thiết bị | ~115 px, vẫn **hiển thị** nếu cột được bật, nhưng **không có filter thiết bị** |
| Voucher | ~96 px, chip nhỏ, không ép rộng dòng |
| Số đơn | ~58 px, canh giữa |
| Thời gian tạo | ~139 px, `dd/mm/yyyy hh:mm` |
| Ghi chú | ~92 px, nội dung rút gọn/có title |
| Thao tác từng dòng | **Bỏ cột thao tác riêng**, vẫn giữ lưu trữ/khôi phục trong slidebar |
| Hành động hàng loạt | Chỉ hiện **khi checkbox có dòng được chọn**; hỗ trợ Lưu trữ/Khôi phục phù hợp trạng thái và Bỏ chọn |
| Nút Cột | Trong **toolbar theo luồng chuẩn** phía trên bảng, không dùng top âm/absolute đè filter |
| Menu Cột | Đúng viewport, cuộn riêng, Esc/bấm ngoài đóng; giữ thứ tự ẩn hiện đã lưu |
| Dropdown filter | Menu thiết kế thống nhất, dùng button/listbox/option, đánh dấu lựa chọn, bàn phím, hidden input để submit form |
| Co giãn | Fit trong vùng chứa khi đủ diện tích; thiếu không gian do slidebar thì cuộn **trong card bảng**, không cuộn ngang cả trang |

Width trên là mặc định định hướng, không ép các trường nội dung khác không thể tùy chỉnh trên Desktop. Nhóm 3 cột ngắn (#, Voucher, Số đơn) giữ gọn kể cả khi có preference quá khổ từ phiên bản trước. CSS dùng `data-account-col`/`<colgroup>` thay cho `:nth-child()`, tránh định độ rộng sai khi ẩn/đổi thứ tự.

## 3. Logic/filter

- **Bỏ thiết bị:** Không render filter `device`; URL `device` cũ không còn áp lọc và được loại khỏi link được tạo mới.
- **Số đơn:** preset `Tất cả, 0, 1, 2, 3, …` dựa trên số đơn hiện có; tối thiểu tới 5, tối đa 20 và nhóm `21+` nếu phát sinh. Lọc đúng **bằng giá trị nguyên**; duy trì nhận URL filter khoảng cũ để không mất liên kết.
- **Tag voucher:** preset `Tất cả / Chưa dùng voucher / tag thực tế` được lấy từ `order_vouchers.voucher_tag` và fallback nhãn thực tế; không tự đặt tag không tồn tại. Lọc khớp chính xác nhãn.
- **Giữ Browser và SPC:** vì chỉ có yêu cầu bỏ lọc *Thiết bị*, không tự xóa các bộ lọc khác.
- **Ngày tạo:** Khi import/tạo User, không can thiệp DB `created_at`. Khi có đơn, chọn `min(user.created_at, min(order.order_date))` với ngày giờ hợp lệ; áp vào bảng, slidebar User và sắp xếp Mới/Cũ. Nếu không có ngày đặt hợp lệ, giữ ngày nhập User.
- Giá trị ngày giờ, voucher, số tiền không được tự suy diễn từ dữ liệu thiếu.

## 4. Checklist nghiệm thu

- [ ] Desktop 1280/1366/1440/1920 (sidebar mở/thu gọn, slidebar User mở/đóng) — không chồng chéo.
- [ ] Tablet 600/768/820/1024; Mobile 320/360/390/414 và ngang — bảng không tràn toàn trang.
- [ ] STT/Voucher/Số đơn đúng kích thước; thử ẩn/hiện và kéo đổi thứ tự nhiều cột.
- [ ] Nút Cột luôn nằm trong toolbar, menu Esc/click ngoài, không bị cắt khi slidebar mở.
- [ ] Nút + trong Username hoạt động; mở User, mở đơn, đóng/back không mất trạng thái không cần thiết.
- [ ] Checkbox xuất hiện, tick → thanh lưu trữ; bỏ tick → biến mất; quyền viewer không có thao tác ghi.
- [ ] Không có filter Thiết bị; dropdown Số đơn/TAG có lựa chọn đúng và gửi đúng query.
- [ ] Kiểm tra User có đơn cũ: ngày tạo hiển thị sớm hơn; `erp_users.created_at` không đổi.
- [ ] Không phát sinh API ghi do resize/filter; pagination/filter, số liệu không lỗi.
- [ ] Build/TypeScript, Chrome QA, Tracking hồi quy và kiểm tra dữ liệu sau reload có bằng chứng trước khi chốt PASS.

**Giới hạn:** P1 QA browser sử dụng các viewport đại diện; chưa coi toàn ma trận màn hình PASS nếu chưa chạy đủ. Không tự merge hoặc deploy Production.
