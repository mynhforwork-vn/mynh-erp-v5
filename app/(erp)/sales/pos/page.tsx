import { ModulePlaceholder } from '@/components/module-placeholder'

export default function Page(){
  return <ModulePlaceholder
    group="BÁN HÀNG"
    title="POS"
    description="Màn bán hàng tại quầy: chọn kho, tìm / quét SKU, giỏ hàng, giữ đơn và thanh toán."
    bullets={["Kho bán HN / BG","Thẻ sản phẩm không ảnh","Giỏ hàng & giảm giá","Tiền mặt / chuyển khoản / ghi nợ / kết hợp","Đơn tạm","In hóa đơn"]}
    backHref="/sales"
  />
}
