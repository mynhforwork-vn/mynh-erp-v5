# MYNH ERP V5 — Demo Data Matrix

Mục tiêu: dữ liệu demo cố định để visual QA + regression nghiệp vụ. Tất cả dữ liệu demo dùng prefix `demo_` hoặc `DEMO-`.

## User
- 10 tài khoản demo.
- Active: 2.
- M01 / M02 / M03 / M04: mỗi trạng thái 1.
- Captcha: 1.
- Auto Hủy: 1.
- Blocked: 1.
- Không xác định: 1.
- Có case đủ SPC_ST + SPC_F + Mobile + Web.
- Có case Web-only, không SPC.
- Có case thiếu email.
- Có nhiều tổ hợp Voucher / không Voucher.

## Orders
- 16 đơn demo, 19 dòng sản phẩm, 7 voucher.
- Có đơn chưa có vận đơn.
- Có đơn một sản phẩm và nhiều sản phẩm.
- Có đơn không voucher và nhiều loại voucher.
- Có case đổi MVĐ: vận đơn cũ inactive + vận đơn mới active.

## Tracking
Active shipment matrix:
- READY_TO_SHIP: 1
- PICKED_UP: 1
- IN_TRANSIT: 1
- ARRIVED_TRANSIT_HUB: 1
- ARRIVED_DESTINATION_HUB: 1
- OUT_FOR_DELIVERY: 1
- DELIVERY_FAILED: 1
- DELIVERED: 4
- CANCELLED: 1
- RETURNING: 1
- RETURNED: 1
- UNKNOWN: 1

## Receive / Warehouse / Payment
- NOT_READY + NOT_READY + UNPAID
- WAITING_RECEIVE + NOT_READY + PENDING
- RECEIVED + READY_TO_TRANSFER + PENDING
- RECEIVED + TRANSFERRED + PARTIAL
- RECEIVED + WAREHOUSE_RECEIVED + PAID
- Cancelled/Returned + REFUNDED

## Alert events
Có đủ 4 nhóm:
- ARRIVED_DESTINATION_HUB
- OUT_FOR_DELIVERY
- DELIVERED
- DELIVERY_FAILED

## Warehouse
- HN01 — Kho Hà Nội
- HCM01 — Kho TP. Hồ Chí Minh
- DN01 — Kho Đà Nẵng

## Regression order
1. User table density + device 4-in-1.
2. User detail/edit/history.
3. Order list product/voucher/status.
4. Order create with multiple items/vouchers.
5. Order edit.
6. Tracking number replacement preserves old shipment.
7. Tracking timeline.
8. Receive/warehouse/payment state displays.
9. Dashboard KPIs and alert previews.

## Notes
- Demo Shopee credentials are fake placeholders only.
- Production Password/SPC values created from UI use Supabase Vault through atomic RPCs.
- Demo data lives only in the V5 Supabase project.
