# MYNH ERP V5 — P0: Quy chuẩn nền tảng bảng

Trạng thái: **P0 technical baseline** · kế thừa bản Tracking PR #59 tại commit `20a741e4b5f2e36370087216f993978137d13c00`.

## 1. Nguyên tắc nền tảng

1. **Giữ chức năng đang chạy.** Không đổi API, SQL, quyền, status mapping, cron, dữ liệu người dùng hoặc nghiệp vụ khi chỉ chuẩn hóa giao diện bảng.
2. **Fit theo container**, không dùng `window.innerWidth` làm thước đo duy nhất. Layout phải xét vùng sau sidebar trái, slidebar phải và các panel khác.
3. **Nội dung ưu tiên đọc được.** Cột định danh, trạng thái và thao tác có giới hạn tối thiểu; các cột văn bản co trước. Nếu vùng chứa quá nhỏ, cuộn ngang **trong đúng bảng**, không cuộn toàn trang.
4. **Mở/đóng slidebar không làm mất cột.** Không dùng sticky action overlay che dữ liệu. Header, body và `colgroup` phải giữ cùng hình học.
5. **Bảng cùng schema mới đồng bộ độ rộng.** Đồng bộ ngay trong lúc kéo; bảng ẩn nhận lại khi mở; reload vẫn đúng. Scope tối thiểu = tab/màn hình hiện tại + định danh schema; không đồng bộ giữa Nhập kho chờ bóc tách và chờ nhập kho.
6. **Giữ quyền tùy biến đã phê duyệt.** Desktop resize chỉ tại bảng được chốt; không tự bật lại ở bảng đã tắt. Mobile/Tablet có bố cục riêng, không phải Desktop thu nhỏ.
7. **Không mất cấu hình cũ.** Nhận diện các phiên bản `localStorage`, giữ thứ tự/ẩn cột/độ rộng đã lưu, bỏ khóa sai/trùng, ghép cột mới gần cột liên quan; không ghi mặc định trước khi hydrate xong.
8. **Tương tác chắc chắn.** Menu Cột đóng khi bấm ngoài hoặc Esc; giữ sort, filter, bulk selection, điều hướng slidebar/Back, form chưa lưu và trạng thái sau reload.
9. **Nội dung số và giờ chuẩn.** Tiền/SL căn phải, mã và tên có đường xem đầy đủ, ngày giờ `dd/mm/yyyy hh:mm`, không đoán dữ liệu thiếu.
10. **Kiểm thử phân tầng.** Đọc code != static test != typecheck != build != Chrome Preview != end-to-end/DB. Chỉ công bố PASS đúng phần đã chứng minh.

## 2. Contract kích thước / mật độ

| Thuộc tính | Định hướng |
|---|---|
| Tên module và tiêu đề bảng | Rõ ràng, không bắt buộc chữ hoa |
| Header bảng | khoảng 10–11 px; sticky khi thích hợp |
| Dòng dữ liệu Desktop | khoảng 11–12 px; hàng ~40–44 px, tăng khi nhiều dòng |
| Mã/SKU/trạng thái | Không cắt thông tin quan trọng; có cách xem toàn bộ |
| Mô tả dài | Tối đa 2 dòng trong ô nếu hợp lý, mở slidebar để xem đầy đủ |
| Sidebar/slidebar | Bảng và vùng cuộn tái tính theo chiều rộng có thật |
| Cuộn | `overflow-x:auto` đúng vùng chứa; không biến trang thành thanh cuộn ngang |
| Cột ghim | Chỉ khi đã có QA hình học; không che phần tử bên cạnh |
| Resize | Desktop ≥901 px chỉ ở bảng đã chốt; Tablet/Mobile ưu tiên bố cục thích ứng |
| Đồng bộ | Chỉ các bảng có `sameSchemaSync` và cùng storage identity |

Các khoảng cỡ chữ là guideline, không ép `!important` toàn hệ thống. Theo từng module chọn ngưỡng `min-width` phù hợp với schema và số cột.

## 3. Kiến trúc đang có (đã đọc trực tiếp trên branch P0)

| Nhóm | Cơ chế hiện tại | Quy tắc triển khai tiếp |
|---|---|---|
| Tracking HUB | `useManagedColumns` + `DesktopTableColumnResize` + lưu độ rộng theo route/schema; sync trực tiếp giữa HUB | **Giữ làm baseline đã nghiệm thu**, không thay thiết kế một hàng HUB |
| Kho / Bán hàng / Công nợ / Báo cáo | `useManagedColumns` và `SortableHeader` | Kiểm tra riêng chiều rộng, scroll, slidebar; không mặc nhiên sync bảng khác schema |
| Đơn nhập, Tài khoản mua hàng | Quản lý order/hidden trong `localStorage` riêng | Kiểm tra migration tương thích trước khi chuyển về helper dùng chung |
| Thu/Chi | Menu quản lý cột và sort riêng | Giữ thứ tự/ẩn cột đã lưu; không thay tính tiền |
| Mapping SPX | CSS grid + hai phần thu gọn/mở rộng | Không ép thành `table`; giữ mapping form |
| Đối soát Shipper | Danh sách card đợt thanh toán | Giữ card; chuẩn hóa typography và co theo slidebar |
| In hóa đơn POS | Bảng in khổ riêng | Ngoại lệ; không áp dụng CSS bảng nghiệp vụ |

**Rủi ro đã nhận diện:** `DesktopTableColumnResize` hiện quét `table.table` ở Desktop (≥901 px), nên cần thống kê quyền resize được duyệt theo module trước khi thay đổi phạm vi. P0 **không** biến quy tắc này thành allowlist mặc định, tránh bật/tắt chức năng ngoài ý muốn.

**Rủi ro CSS:** Quy tắc từ `option1-system.css`, `remediation-ux-v3.css`, `brand-responsive-v1.css`, `tracking-compact-actions-v1.css`, `enterprise-tables-v1.css` đang cùng tác động vào bảng. P1–P5 chỉ sửa selector đúng module; tránh thêm lớp CSS toàn cục và phải rà soát `<colgroup>` / `<th>` / `<td>` cùng lúc.

## 4. Việc P0 thực hiện trong nhánh riêng

- Thêm `lib/table-column-preferences.ts`: helper chuẩn hóa cấu hình đã lưu, không phụ thuộc DOM, giữ backward compatibility.
- Chỉnh `useManagedColumns` để **đọc và phục hồi** trước khi ghi default; không bắn event lưu lại nếu chuỗi cấu hình không thay đổi; dùng cùng helper khi nhận event từ bảng khác.
- Chỉnh `useManagedSort` tương tự để không ghi default đè sort đã lưu lúc mount.
- Thêm `scripts/table-platform-p0-qa.mjs`: test dữ liệu cũ/trùng/khóa bắt buộc/thêm cột, kiểm tra contract Tracking và kiểm kê các bảng, xuất artifact JSON.
- Workflow P0 **chỉ chạy kiểm thử và typecheck**, không deploy, không tạo QA user, không ghi Supabase.

**Ngoài phạm vi P0:** đổi CSS module, bật/tắt resize, triển khai giao diện, migration bảng cũ, Supabase, API, Cron, Cloudflare Worker.

## 5. Phân vùng chuẩn hóa theo pha

| Pha | Màn hình | Đồng bộ schema |
|---|---|---|
| P1 | Tài khoản mua hàng; Đơn nhập | Chỉ từng loại bảng tương đồng; Tracking hồi quy |
| P2 | Nhập kho (chờ bóc tách / chờ nhập kho), Tồn kho, Lịch sử kho | Chờ bóc tách và chờ nhập kho là **hai nhóm độc lập** |
| P3 | Lịch sử bán, Khách hàng, Công nợ | Theo mỗi loại bảng, không chia cấu hình theo tên dữ liệu |
| P4 | Thu/Chi, Đối soát, Báo cáo theo ngày | Giữ ưu tiên số tiền/ghi nhận và kết quả đối soát |
| P5 | Cài đặt Tracking, tổng quan Kho/Mua hàng/Tài chính, ngoại lệ POS | Các grid/cards không tự chuyển sang `table` |

Danh sách nguồn cụ thể có trong artifact `qa-table-platform-p0-artifacts/inventory.json` được sinh bởi test.

## 6. QA bắt buộc trước khi nghiệm thu mỗi nhóm

**Ma trận tối thiểu theo rủi ro:**

- Desktop: 1280×720, 1366×768, 1440×900, 1920×1080, 2560×1600.
- Tablet: 600×960, 768×1024, 820×1180, 1024×768, 1180×820.
- Mobile: 320×568, 360×800, 390×844, 414×896, 568×320, 844×390.
- Khi đổi CSS layout chung/phát hành: mở rộng theo đầy đủ ma trận QA dự án.

**Kịch bản cần giữ:**

1. Sidebar trái mở/đóng × slidebar phải mở/đóng.
2. Bảng ít/nhiều dòng, nội dung dài, mã dài, dữ liệu rỗng.
3. Fit toàn chiều rộng khi đủ chỗ, cuộn ngang nội bộ khi không đủ.
4. Nếu được phép resize: kéo ở bảng A → bảng B cùng schema đổi **ngay**; thu gọn/mở lại; reload.
5. Cấu hình cột cũ: thứ tự, ẩn/hiện, thêm cột mới, cột bắt buộc, sort.
6. Menu Cột: click ngoài/Esc; không trùng menu/nút.
7. Click bản ghi → chi tiết → dữ liệu liên quan → Back; không reset filter/selection.
8. Phân quyền, lỗi API, persistence, không phát sinh mutation khi chỉ resize/scroll.

**Các tiêu chí FAIL tự động:** tràn `document.scrollWidth`, cột/tiêu đề đè nhau, hàng nhóm HUB nhiều dòng, panel che cột cuối, mất nút xử lý, cấu hình cột bị reset, request ghi dữ liệu do chỉnh UI.

## 7. Tiêu chí hoàn thành P0

- [x] Xác minh branch/PR/commit gốc.
- [x] Kiểm kê component bảng + xác định schema đồng bộ.
- [x] Tách helper khôi phục cấu hình có backward compatibility.
- [x] Chặn ghi mặc định trước khi đọc cấu hình cũ trong shared hooks.
- [x] Bổ sung test + artifact kiểm kê.
- [ ] Typecheck và test P0 đạt trên đúng commit cuối cùng.
- [ ] Hồi quy Chrome cho luồng bảng thực tế khi bắt đầu P1, sử dụng Preview độc lập.
- [ ] Nghiệm thu chuyên biệt từng module P1–P5; không coi P0 là PASS toàn hệ thống.

Không merge/deploy từ P0 khi chưa có phê duyệt.
