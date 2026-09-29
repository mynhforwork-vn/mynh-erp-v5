import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'

async function count(q:PromiseLike<{count:number|null}>){
  try{return (await q).count??0}catch{return 0}
}

export default async function WarehousePage(){
  const {supabase}=await requireUser()
  const [waiting,received,warehouses,transfers]=await Promise.all([
    count(supabase.from('orders').select('*',{count:'exact',head:true}).eq('receive_status','WAITING_RECEIVE')),
    count(supabase.from('orders').select('*',{count:'exact',head:true}).eq('receive_status','RECEIVED')),
    supabase.from('warehouses').select('*').limit(50),
    supabase.from('transfer_batches').select('*').order('created_at',{ascending:false}).limit(20),
  ])

  return <>
    <header className="page-head">
      <div>
        <h1>Tổng quan kho</h1>
        <p>Kho nội bộ, xác nhận nhận hàng, chuyển kho và tồn kho</p>
      </div>
      <div className="head-actions">
        <Link className="button primary" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Xử lý đơn chờ nhận</Link>
      </div>
    </header>

    <section className="kpi-grid small-grid">
      <Link href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE" className="kpi-card warning">
        <span>Chờ xác nhận nhận</span><b>{waiting}</b><small>Đã giao thành công, chờ nhận vật lý</small>
      </Link>
      <Link href="/purchase/orders?range=all&receive=RECEIVED" className="kpi-card">
        <span>Đã nhận</span><b>{received}</b><small>Sẵn sàng cho nghiệp vụ kho tiếp theo</small>
      </Link>
      <div className="kpi-card"><span>Kho nội bộ</span><b>{warehouses.data?.length??0}</b><small>Kho đang cấu hình</small></div>
      <div className="kpi-card"><span>Đợt chuyển kho</span><b>{transfers.data?.length??0}</b><small>Các đợt chuyển gần nhất</small></div>
    </section>

    <section className="content-grid two">
      <div className="card">
        <div className="card-head"><h2>Danh sách kho nội bộ</h2></div>
        {!warehouses.data?.length
          ? <div className="empty compact">Chưa cấu hình kho.</div>
          : warehouses.data.map((w:any)=><div className="entity-row" key={w.id}>
              <div><b>{w.name??w.code??'Kho'}</b><span>{w.code??w.address??'—'}</span></div>
              <span className="badge green">HOẠT ĐỘNG</span>
            </div>)}
      </div>

      <div className="card">
        <div className="card-head"><h2>Luồng kho</h2></div>
        <div className="flow-stack">
          <div><b>1</b><span>Giao hàng thành công</span><small>→ Chờ nhận</small></div>
          <div><b>2</b><span>Nhân viên xác nhận vật lý</span><small>→ Đã nhận</small></div>
          <div><b>3</b><span>Tạo đợt chuyển kho</span><small>→ Đã chuyển kho</small></div>
          <div><b>4</b><span>Kho đích xác nhận</span><small>→ Ghi nhận tồn kho</small></div>
        </div>
      </div>
    </section>
  </>
}
