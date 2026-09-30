import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime } from '@/lib/format'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'

type SP={type?:string,warehouse?:string}

const IN_TYPES=new Set(['IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN'])

function txLabel(type:string){
  if(type==='IN')return 'Nhập kho'
  if(type==='OUT')return 'Xuất kho'
  if(type==='TRANSFER_IN')return 'Nhận chuyển'
  if(type==='TRANSFER_OUT')return 'Xuất chuyển'
  if(type==='SALE')return 'Bán hàng'
  if(type==='RETURN')return 'Hoàn hàng'
  if(type==='ADJUSTMENT_IN')return 'Điều chỉnh tăng'
  if(type==='ADJUSTMENT_OUT')return 'Điều chỉnh giảm'
  return type
}

export default async function WarehouseHistoryPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()

  let query=supabase.from('inventory_transactions')
    .select('id,warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_at,warehouses(id,code,name),product_variants(id,variant_name,products(id,sku,name))')
    .order('created_at',{ascending:false})
    .limit(500)
  if(sp.type)query=query.eq('tx_type',sp.type as any)
  if(sp.warehouse)query=query.eq('warehouse_id',sp.warehouse)

  const [{data:rows,error},{data:warehouses}]=await Promise.all([
    query,
    supabase.from('warehouses').select('id,code,name').eq('is_active',true).order('code').limit(100),
  ])

  const data=(rows??[]) as any[]
  const inQty=data.filter(x=>IN_TYPES.has(String(x.tx_type))).reduce((s,x)=>s+Number(x.quantity??0),0)
  const outQty=data.filter(x=>!IN_TYPES.has(String(x.tx_type))).reduce((s,x)=>s+Number(x.quantity??0),0)

  function href(type?:string|null){
    const p=new URLSearchParams()
    if(type)p.set('type',type)
    if(sp.warehouse)p.set('warehouse',sp.warehouse)
    const qs=p.toString()
    return '/warehouse/history'+(qs?'?'+qs:'')
  }

  return <div className="warehouse-screen warehouse-history-screen">
    <header className="page-head warehouse-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Lịch sử kho</h1>
        <p>Ledger bất biến theo SKU bán, kho, loại giao dịch và chứng từ nguồn.</p>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/history"/>
    {error&&<div className="error-box">Không thể tải lịch sử kho: {error.message}</div>}

    <section className="warehouse-status-strip">
      <div><span>Giao dịch hiển thị</span><b>{data.length}</b><small>Tối đa 500 dòng gần nhất</small></div>
      <div className="success"><span>Tổng tăng</span><b>+{inQty}</b><small>Trong tập đang lọc</small></div>
      <div className="warning"><span>Tổng giảm</span><b>-{outQty}</b><small>Trong tập đang lọc</small></div>
    </section>

    <div className="warehouse-history-toolbar">
      <div className="warehouse-history-tabs">
        <Link className={!sp.type?'active':''} href={href(null)}>Tất cả</Link>
        <Link className={sp.type==='TRANSFER_IN'?'active':''} href={href('TRANSFER_IN')}>Nhận chuyển</Link>
        <Link className={sp.type==='TRANSFER_OUT'?'active':''} href={href('TRANSFER_OUT')}>Xuất chuyển</Link>
        <Link className={sp.type==='SALE'?'active':''} href={href('SALE')}>Bán</Link>
        <Link className={sp.type==='RETURN'?'active':''} href={href('RETURN')}>Hoàn</Link>
        <Link className={sp.type==='ADJUSTMENT_IN'?'active':''} href={href('ADJUSTMENT_IN')}>Điều chỉnh +</Link>
        <Link className={sp.type==='ADJUSTMENT_OUT'?'active':''} href={href('ADJUSTMENT_OUT')}>Điều chỉnh −</Link>
      </div>
      <form action="/warehouse/history">
        {sp.type&&<input type="hidden" name="type" value={sp.type}/>}
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </select>
        <button className="button small" type="submit">Lọc kho</button>
      </form>
    </div>

    <div className="card warehouse-history-table-card">
      <table className="table warehouse-history-table">
        <thead><tr>
          <th>Thời gian</th><th>Kho</th><th>SKU bán</th><th>Sản phẩm</th><th>Phân loại</th><th>Nghiệp vụ</th><th>SL</th><th>Chứng từ</th>
        </tr></thead>
        <tbody>{!data.length
          ? <tr><td colSpan={8} className="empty">Chưa có giao dịch kho phù hợp.</td></tr>
          : data.map(row=>{
              const incoming=IN_TYPES.has(String(row.tx_type))
              return <tr key={row.id}>
                <td>{formatDateTime(row.created_at)}</td>
                <td><b>{row.warehouses?.code??'—'}</b></td>
                <td><b>{row.product_variants?.products?.sku??'—'}</b></td>
                <td>{row.product_variants?.products?.name??'—'}</td>
                <td>{row.product_variants?.variant_name??'—'}</td>
                <td><span className={'warehouse-tx-type '+(incoming?'in':'out')}>{txLabel(String(row.tx_type))}</span></td>
                <td className={'warehouse-tx-qty '+(incoming?'in':'out')}>{incoming?'+':'-'}{row.quantity}</td>
                <td><div className="warehouse-reference"><b>{row.reference_type??'—'}</b><small>{row.reference_id?String(row.reference_id).slice(0,8):'Không mã'}</small></div></td>
              </tr>
            })}</tbody>
      </table>
    </div>
  </div>
}
