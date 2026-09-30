import { ModulePlaceholder } from '@/components/module-placeholder'

export default function Page(){
  return <ModulePlaceholder
    group="BÁN HÀNG"
    title="Lịch sử bán"
    description="Tra cứu hóa đơn POS, in lại, hủy hóa đơn, hoàn hàng và xem lịch sử thanh toán."
    bullets={["Danh sách hóa đơn","Chi tiết sản phẩm","Thanh toán","In lại hóa đơn","Hủy / hoàn hàng","Lịch sử thao tác"]}
    backHref="/sales"
  />
}
