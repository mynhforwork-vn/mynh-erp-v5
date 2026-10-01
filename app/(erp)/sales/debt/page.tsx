import { ModulePlaceholder } from '@/components/module-placeholder'

export default function Page(){
  return <div className="tracking-screen tracking-screen-v2 sales-placeholder-screen sales-contrast-v3">
    <ModulePlaceholder
      group="BÁN HÀNG"
      title="Công nợ"
      description="Theo dõi phát sinh, đã thu, số dư và phân bổ thanh toán khách hàng."
      bullets={["Phát sinh nợ","Đã thu","Còn nợ","Phân bổ thanh toán"]}
      backHref="/sales"
    />
  </div>
}
