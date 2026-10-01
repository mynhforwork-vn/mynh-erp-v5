import { ModulePlaceholder } from '@/components/module-placeholder'

export default function Page(){
  return <div className="tracking-screen tracking-screen-v2 sales-placeholder-screen sales-contrast-v3">
    <ModulePlaceholder
      group="BÁN HÀNG"
      title="Khách hàng"
      description="Hồ sơ khách hàng, lịch sử mua, doanh số và công nợ hiện tại."
      bullets={["Thông tin khách","Lịch sử mua","Tổng doanh số","Công nợ hiện tại"]}
      backHref="/sales"
    />
  </div>
}
