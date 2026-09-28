import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatMoney } from '@/lib/format'

async function count(q:PromiseLike<{count:number|null}>){try{return (await q).count??0}catch{return 0}}

export default async function PurchaseDashboard(){
  const {supabase}=await requireUser()
  const [accounts,orders,shipping,waiting,codRows]=await Promise.all([
    count(supabase.from('erp_users').select('*',{count:'exact',head:true})),
    count(supabase.from('orders').select('*',{count:'exact',head:true})),
    count(supabase.from('shipments').select('*',{count:'exact',head:true}).eq('is_active',true).eq('tracking_enabled',true)),
    count(supabase.from('orders').select('*',{count:'exact',head:true}).eq('receive_status','WAITING_RECEIVE')),
    supabase.from('orders').select('cod').limit(1000),
  ])
  const cod=(codRows.data??[]).reduce((s:any,o:any)=>s+Number(o.cod??0),0)

  return <>
    <header className="page-head">
      <div><span className="module-eyebrow">MUA HÀNG</span><h1>Tổng quan mua hàng</h1><p>Tình trạng tài khoản mua hàng, đơn nhập và vận chuyển của toàn hệ thống</p></div>
      <div className="head-actions"><Link className="button" href="/purchase/tracking">Cảnh báo vận chuyển</Link><Link className="button primary" href="/purchase/orders?mode=create">+ Tạo đơn nhập</Link></div>
    </header>
    <section className="kpi-grid">
      <Link href="/purchase/accounts" className="kpi-card"><span>Tài khoản mua hàng</span><b>{accounts}</b><small>Tài khoản đang lưu trong hệ thống</small></Link>
      <Link href="/purchase/orders" className="kpi-card"><span>Tổng đơn nhập</span><b>{orders}</b><small>Toàn bộ đơn mua đã lưu</small></Link>
      <div className="kpi-card"><span>Tổng COD</span><b className="kpi-money">{formatMoney(cod)}</b><small>Giá trị COD của dữ liệu hiện có</small></div>
      <Link href="/purchase/tracking" className="kpi-card"><span>Đang vận chuyển</span><b>{shipping}</b><small>Vận đơn đang được theo dõi</small></Link>
      <Link href="/purchase/orders?receive=WAITING_RECEIVE" className="kpi-card warning"><span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Đã giao nhưng ERP chưa xác nhận nhận</small></Link>
      <Link href="/warehouse/receive" className="kpi-card"><span>Chuyển sang nhập kho</span><b>→</b><small>Đơn đã nhận sẽ đi vào nghiệp vụ kho</small></Link>
    </section>
    <section className="content-grid two">
      <Link className="card module-shortcut" href="/purchase/accounts"><b>Tài khoản mua hàng</b><span>Quản lý Shopee hiện tại và mở rộng nền tảng sau.</span></Link>
      <Link className="card module-shortcut" href="/purchase/orders"><b>Đơn nhập hàng</b><span>Sản phẩm, voucher, COD, người nhận, MVĐ và lịch sử.</span></Link>
      <Link className="card module-shortcut" href="/purchase/tracking"><b>Cảnh báo vận chuyển</b><span>Theo dõi theo kho đích, đồng bộ và xác nhận nhận hàng.</span></Link>
      <Link className="card module-shortcut" href="/warehouse"><b>Chuyển sang quản lý kho</b><span>Tiếp tục luồng sau khi đơn được xác nhận đã nhận.</span></Link>
    </section>
  </>
}
