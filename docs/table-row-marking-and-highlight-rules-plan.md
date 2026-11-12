# Đợt 3 — Pin, gắn cờ và highlight nhiều dòng theo quy tắc

Trạng thái: thiết kế chờ nghiệm thu, KHÔNG phải mã vận hành. Phạm vi MYNH ERP V5, định hướng Neo Enterprise Light. Không sửa bảng nghiệp vụ hoặc ghi dữ liệu Production trong nhánh này.

## 1. Nguyên tắc nghiệp vụ
1. **Ghim (Pin)**: cá nhân. Dòng được ưu tiên trong chính bảng / kho / nhóm hiện hành, không thay đổi KPI hoặc trạng thái kinh doanh. Ghim không kéo dòng ra khỏi phạm vi bộ lọc.
2. **Gắn cờ**: dùng chung, quyền thao tác theo module (ưu tiên Admin/Operator); có lý do, loại cờ, người tạo và lịch sử cập nhật. Cờ không đồng nghĩa cảnh báo vận chuyển.
3. **Highlight thủ công**: cá nhân, cho phép một hoặc nhiều dòng và bỏ highlight hàng loạt; chỉ thay đổi màu nền nhẹ. Không đổi tem trạng thái, SKU, đơn nhập hoặc tồn.
4. **Highlight theo quy tắc**: cá nhân, được bật/tắt và sắp ưu tiên; tạo từ các trường dữ liệu có sẵn của từng bảng. Chỉ dùng toán tử/giá trị whitelisted, không nhận SQL hoặc JavaScript.
5. Quy tắc ưu tiên màu: **thủ công > quy tắc ưu tiên cao nhất > nền mặc định**. Cờ có biểu tượng riêng; pin có biểu tượng riêng. Tem trạng thái nghiệp vụ giữ palette độc lập.

## 2. Chọn nhiều dòng, không chồng chéo với chức năng nhập kho
- Nút **Đánh dấu** có biểu tượng tại khu thao tác bảng, mở **chế độ chọn để đánh dấu**. Checkbox xuất hiện gọn trong cột mã đơn, không thêm cột rộng hoặc thay thế checkbox chọn hàng để nhập kho đã có.
- Bấm nhiều dòng qua nhiều nhóm kho BG/HN trong cùng bộ lọc, không tự mở slidebar. Slidebar chi tiết đơn vẫn chỉ mở khi bấm mã đơn.
- Toolbar duy nhất: số đã chọn · tô màu · bỏ màu · ghim/bỏ ghim · gắn cờ · bỏ chọn. Sau khi lưu, thông báo góc trên, tự ẩn sau 5s.
- **Chọn tất cả trên trang đang hiển thị** khác với tất cả bản ghi kết quả lọc. Không ngầm ghi vào những trang chưa tải; với kết quả lớn cần xác nhận số lượng rõ ràng và xử lý theo lô có giới hạn.
- Trạng thái chọn chỉ trong phiên; **trạng thái đánh dấu** cần lưu ở DB theo người dùng và còn sau reload, trên mọi thiết bị.
- Khi thao tác chọn hàng loạt cho nhập kho đang mở, không tự bật chế độ đánh dấu. Người dùng có thể thoát bằng Esc, bấm ngoài menu hoặc nút hủy.

## 3. Cấu hình quy tắc
- Mở phần **Quy tắc highlight** từ toolbar, hiển thị panel gọn không đè bảng/slidebar đơn.
- Mỗi quy tắc gồm tên, phạm vi bảng, màu nền, bật/tắt, số thứ tự ưu tiên, một nhóm **VÀ/HOẶC** tối đa 6 điều kiện.
- Điều kiện: trường dữ liệu whitelist theo module, toán tử (bằng, khác, thuộc danh sách, chứa, lớn hơn, nhỏ hơn, trống/không trống). Kiểu giá trị được kiểm tra theo schema của trường.
- Xem trước số dòng khớp với **dữ liệu đang tải**, ghi rõ khi không đại diện toàn bộ hệ thống. Preview chỉ đánh dấu, không thay đổi bảng.
- Bảng **Nhập kho**: trạng thái kho, kho nhận, ngày nhận, có/không mã SKU, số lượng dòng, trạng thái quyết định.
- Bảng **Đơn nhập**: trạng thái đơn, nhà vận chuyển, kho đích, ngày đơn, tình trạng ghép/tracking.
- Bảng **Tồn kho**: kho nhận, SKU, nhóm phân loại, số lượng tồn, mức cảnh báo nếu hiện hữu.
- Các bảng khác mở dần theo data schema thực tế; không ép biểu thức chung khi chưa ánh xạ trường.

## 4. Thiết kế lưu trữ dự kiến (chưa áp dụng SQL)
- `user_table_row_marks`: `user_id`, `scope`, `row_key`, `pinned`, `color`, `updated_at`, unique theo user/scope/key. RLS: người dùng chỉ thao tác bản ghi của mình.
- `table_row_flags`: `scope`, `row_key`, `reason`, `flag_type`, `created_by`, `updated_at`; lịch sử thay đổi ghi audit. Truy cập qua RPC kiểm tra quyền module, không để RLS chung làm rò dữ liệu bảng khác.
- `user_table_highlight_rules`: `id`, `user_id`, `scope`, `title`, `enabled`, `priority`, `match_mode`, `conditions(jsonb)`, `color`, `updated_at`. Có giới hạn số quy tắc và validate server-side.
- Lưu theo ID ổn định, **không lưu theo vị trí dòng**, tránh sai khi lọc/sắp xếp. Dùng API/RPC batch có giới hạn và quyền rõ ràng.
- Không sử dụng `localStorage` làm nguồn dữ liệu chính; chỉ lưu trạng thái UI tạm thời. Không đưa SQL do người dùng nhập vào DB.
- Màu được giới hạn theo tên palette: vàng nhạt, xanh lam nhạt, xanh lá nhạt, tím nhạt, hồng nhạt; không nhận CSS tự do.

## 5. QA & phát hành
- Unit: parser/validator điều kiện, thứ tự quy tắc, màu ưu tiên, tương tác nhiều dòng, lọc/sắp xếp, 0–1–2–>2 dòng, hai nhóm kho.
- SQL cô lập: owner RLS; API chống ghi nhầm người dùng; role Admin/Operator/Viewer; lưu sau reload; audit flag; thao tác nhóm có giới hạn; retry không trùng.
- Browser Desktop/Tablet/Mobile: kiểm tra bảng auto-fit khi mở slidebar, scroll, Esc/ngoài menu, không overflow, không click nhầm mở slidebar, đúng màu tem trạng thái.
- E2E Preview có đăng nhập trước khi trình merge; Preview không ghi Production.
- Phát hành riêng sau đợt 2; không merge/deploy trước nghiệm thu.

## 6. Phạm vi giai đoạn đầu
Ưu tiên module **Nhập kho** và **Đơn nhập** để kiểm chứng hai dạng bảng và hai kiểu checkbox; sau đó mới nhân rộng Tồn kho, User, POS, Khách hàng/Công nợ và Tài chính khi schema/QA phù hợp. Không tạo API hay CSS chồng lên logic bảng cũ.
