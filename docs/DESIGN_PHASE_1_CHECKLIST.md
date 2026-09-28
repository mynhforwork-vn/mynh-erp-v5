# MYNH ERP V5 — Giai đoạn 1: Design System / Shell

Trạng thái: ĐANG TRIỂN KHAI

## Design Freeze
- [x] Option 1 — Hiện đại & Chuyên nghiệp
- [x] Dense Rounded Enterprise
- [x] Inter duy nhất
- [x] Primary #22324A
- [x] Secondary #365072
- [x] Background #F5F7FA
- [x] UI tiếng Việt

## Shell
- [x] Sidebar navy cố định
- [x] Active navigation thống nhất
- [x] Thay icon chữ U/Đ/V/K bằng SVG line icons
- [x] Footer tài khoản đồng bộ
- [x] Main workspace cùng một nền và spacing
- [x] Responsive rail cho màn hình hẹp
- [ ] Visual QA 1440×900 trên deployment thật
- [ ] Visual QA 2560×1600 trên deployment thật

## Components
- [x] Button
- [x] Input / Select / Textarea
- [x] Card
- [x] KPI
- [x] Toolbar
- [x] Segmented filter
- [x] Table header / row density
- [x] Status badge
- [x] Empty / error state
- [x] Timeline
- [x] Login card

## Right Detail Panel
- [x] Width chuẩn 360–382px theo viewport
- [x] Sticky, inner scroll
- [x] Không dùng modal cho primary workflow
- [x] Đơn hàng dùng split-layout
- [x] Tài khoản Shopee dùng split-layout, không overlay table
- [ ] Regression các panel còn lại khi bổ sung module

## Tiêu chuẩn mật độ
- [x] Table row 34px
- [x] Table data ~10.75–11px
- [x] Header ~8.25–9px
- [x] Controls ~30–31px
- [x] Radius 5–7px chủ đạo
- [x] Card shadow rất nhẹ

## Sau khi PASS Giai đoạn 1
1. Tổng quan
2. Tài khoản Shopee
3. Đơn hàng
4. Vận chuyển
5. Kho

Không chuyển sang redesign nghiệp vụ trước khi shell/component visual regression đạt.
