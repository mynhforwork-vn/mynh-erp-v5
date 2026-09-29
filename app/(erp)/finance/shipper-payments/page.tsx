import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime, formatMoney } from '@/lib/format'

export default async function ShipperPaymentsPage(){
  const {supabase}=await requireUser()
  const {data,error}=await supabase.from('shipper_payments')
    .select('id,shipper_id,shipper_name,total_cod,actual_transferred,tip,transferred_at,note,destination_shippers(name,phone),warehouses(code,name),shipper_payment_details(order_id,cod_snapshot,orders(shopee_order_id,destination_hub))')
    .order('transferred_at',{ascending:false})
    .limit(200)

  const rows=(data??[]) as any[]
  const totalCod=rows.reduce((sum,p)=>sum+Number(p.total_cod??0),0)
  const transferred=rows.reduce((sum,p)=>sum+Number(p.actual_transferred??0),0)
  const tip=rows.reduce((sum,p)=>sum+Number(p.tip??0),0)
  const orderCount=rows.reduce((sum,p)=>sum+(p.shipper_payment_details?.length??0),0)

  return <>
    <header className="page-head">
      <div>
        <span className="module-eyebrow">TÀI CHÍNH</span>
        <h1>Thanh toán Shipper</h1>
        <p>Mỗi đợt chuyển có thể gồm nhiều đơn; Tip = Thực chuyển − Tổng COD.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
        <Link className="button" href="/finance">Tổng quan tài chính</Link>
      </div>
    </header>

    {error&&<div className="error-box">Không thể tải thanh toán Shipper: {error.message}</div>}

    <section className="shipper-finance-kpis">
      <div className="command-kpi"><span>Đợt thanh toán</span><b>{rows.length}</b><small>{orderCount} đơn đã đối soát</small></div>
      <div className="command-kpi"><span>Tổng COD</span><b className="money">{formatMoney(totalCod)}</b><small>COD snapshot trong các đợt</small></div>
      <div className="command-kpi"><span>Thực chuyển</span><b className="money">{formatMoney(transferred)}</b><small>Tổng tiền đã ghi chuyển</small></div>
      <div className="command-kpi warning"><span>Tổng Tip</span><b className="money">{formatMoney(tip)}</b><small>Chênh lệch trên Tổng COD</small></div>
    </section>

    <section className="shipper-payment-batches">
      {!rows.length
        ? <div className="card empty">Chưa có đợt thanh toán Shipper.</div>
        : rows.map(p=>{
            const hubs=[...new Set((p.shipper_payment_details??[]).map((d:any)=>d.orders?.destination_hub).filter(Boolean))]
            const shipper=(p.destination_shippers as any)??null
            return <article className="card shipper-payment-batch" key={p.id}>
            <div className="shipper-payment-batch-head">
              <div>
                <span className="module-eyebrow">HUB KHO ĐÍCH</span>
                <h2>{hubs.join(' · ')||'Chưa xác định Hub'}</h2>
                <small>{shipper?.name??p.shipper_name??'Shipper'}{shipper?.phone?' · '+shipper.phone:''} · {(p.warehouses as any)?.code??'—'} · {formatDateTime(p.transferred_at)}</small>
              </div>
              <div className="shipper-payment-batch-metrics">
                <div><span>Đơn</span><b>{p.shipper_payment_details?.length??0}</b></div>
                <div><span>COD</span><b>{formatMoney(p.total_cod)}</b></div>
                <div><span>Thực chuyển</span><b>{formatMoney(p.actual_transferred)}</b></div>
                <div><span>Tip</span><b>{formatMoney(p.tip)}</b></div>
              </div>
            </div>

            <div className="compact-table-wrap">
              <table className="table compact-summary-table">
                <thead><tr><th>Mã đơn</th><th>Kho đích</th><th>COD snapshot</th></tr></thead>
                <tbody>{(p.shipper_payment_details??[]).map((d:any)=><tr key={d.order_id}>
                  <td className="strong">{d.orders?.shopee_order_id??d.order_id.slice(0,8)}</td>
                  <td>{d.orders?.destination_hub??'—'}</td>
                  <td className="money">{formatMoney(d.cod_snapshot)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {p.note&&<div className="shipper-payment-note"><span>Ghi chú</span><b>{p.note}</b></div>}
          </article>
        })}
    </section>
  </>
}
