import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime } from '@/lib/format'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'

type SP={type?:string,warehouse?:string,ref?:string}

const IN_TYPES=new Set(['IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN'])
const OUT_TYPES=new Set(['OUT','TRANSFER_OUT','SALE','ADJUSTMENT_OUT'])

function txLabel(type:string,referenceType?:string|null){
  if(String(referenceType??'').startsWith('STOCKTAKE'))return 'Kiểm kê'
  if(type==='IN')return 'Nhập kho'
  if(type==='OUT')return 'Xuất kho'
  if(type==='TRANSFER_IN')return 'Nhận chuyển'
  if(type==='TRANSFER_OUT')return 'Chuyển kho'
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
    .limit(1000)
  if(sp.type)query=query.eq('tx_type',sp.type as any)
  if(sp.warehouse)query=query.eq('warehouse_id',sp.warehouse)
  if(sp.ref==='stocktake')query=query.ilike('reference_type','STOCKTAKE%')

  const [{data:rows,error},{data:warehouses}]=await Promise.all([
    query,
    supabase.from('warehouses').select('id,code,name').eq('is_active',true).order('code').limit(100),
  ])

  const data=(rows??[]) as any[]
  const inQty=data.filter(x=>IN_TYPES.has(String(x.tx_type))).reduce((s,x)=>s+Number(x.quantity??0),0)
  const outQty=data.filter(x=>OUT_TYPES.has(String(x.tx_type))).reduce((s,x)=>s+Number(x.quantity??0),0)
  const adjustmentCount=data.filter(x=>['ADJUSTMENT_IN','ADJUSTMENT_OUT'].includes(String(x.tx_type))&&!String(x.reference_type??'').startsWith('STOCKTAKE')).length
  const stocktakeCount=data.filter(x=>String(x.reference_type??'').startsWith('STOCKTAKE')).length

  function href(extra:{type?:string|null,ref?:string|null}={}){
    const p=new URLSearchParams()
    const type=Object.prototype.hasOwnProperty.call(extra,'type')?extra.type:sp.type
    const ref=Object.prototype.hasOwnProperty.call(extra,'ref')?extra.ref:sp.ref
    if(type)p.set('type',type)
    if(ref)p.set('ref',ref)
    if(sp.warehouse)p.set('warehouse',sp.warehouse)
    const qs=p.toString()
    return '/warehouse/history'+(qs?'?'+qs:'')
  }

  return <div className="warehouse-screen warehouse-history-screen warehouse-v2">
    <header className="page-head warehouse-page-head warehouse-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Lịch sử kho</h1>
        <p>Ledger nhập, xuất, bán, kiểm kê, điều chỉnh và chuyển kho theo từng SKU bán.</p>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/history"/>
    {error&&<div className="error-box">Không thể tải lịch sử kho: {error.message}</div>}

    <section className="warehouse-status-strip warehouse-status-strip-5 warehouse-kpi-row">
      <div><span>Giao dịch</span><b>{data.length}</b><small>Tối đa 1.000 dòng gần nhất</small></div>
      <div className="success"><span>Tổng nhập</span><b>+{inQty}</b><small>SL tăng trong tập đang lọc</small></div>
      <div className="info"><span>Tổng xuất</span><b>-{outQty}</b><small>SL giảm trong tập đang lọc</small></div>
      <div className="warning"><span>Điều chỉnh</span><b>{adjustmentCount}</b><small>Phát sinh ngoài kiểm kê</small></div>
      <div><span>Kiểm kê</span><b>{stocktakeCount}</b><small>Giao dịch chênh lệch kiểm kê</small></div>
    </section>

    <div className="warehouse-history-toolbar warehouse-toolbar-v2">
      <div className="warehouse-history-tabs">
        <Link className={!sp.type&&!sp.ref?'active':''} href={href({type:null,ref:null})}>Tất cả</Link>
        <Link className={sp.type==='IN'?'active':''} href={href({type:'IN',ref:null})}>Nhập kho</Link>
        <Link className={sp.type==='SALE'?'active':''} href={href({type:'SALE',ref:null})}>Bán hàng</Link>
        <Link className={sp.type==='TRANSFER_OUT'?'active':''} href={href({type:'TRANSFER_OUT',ref:null})}>Chuyển kho</Link>
        <Link className={sp.ref==='stocktake'?'active':''} href={href({type:null,ref:'stocktake'})}>Kiểm kê</Link>
        <Link className={sp.type==='ADJUSTMENT_OUT'?'active':''} href={href({type:'ADJUSTMENT_OUT',ref:null})}>Điều chỉnh</Link>
      </div>
      <form action="/warehouse/history">
        {sp.type&&<input type="hidden" name="type" value={sp.type}/>}
        {sp.ref&&<input type="hidden" name="ref" value={sp.ref}/>}
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </select>
        <button className="button small" type="submit">Lọc kho</button>
      </form>
    </div>

    <div className="card warehouse-history-table-card warehouse-table-surface">
      <div className="warehouse-table-head">
        <div><h2>Biến động tồn kho</h2><span>Mọi thay đổi đều được ghi thành transaction, không sửa âm thầm số tồn.</span></div>
      </div>
      <table className="table warehouse-history-table">
        <thead><tr>
          <th>Thời gian</th><th>Kho</th><th>SKU bán</th><th>Sản phẩm</th><th>Phân loại</th><th>Nghiệp vụ</th><th>SL</th><th>Chứng từ</th>
        </tr></thead>
        <tbody>{!data.length
          ? <tr><td colSpan={8} className="empty">Chưa có giao dịch kho phù hợp.</td></tr>
          : data.map(row=>{
              const incoming=IN_TYPES.has(String(row.tx_type))
              const stocktake=String(row.reference_type??'').startsWith('STOCKTAKE')
              return <tr key={row.id}>
                <td>{formatDateTime(row.created_at)}</td>
                <td><b>{row.warehouses?.code??'—'}</b></td>
                <td><b className="warehouse-sku-code">{row.product_variants?.products?.sku??'—'}</b></td>
                <td>{row.product_variants?.products?.name??'—'}</td>
                <td>{row.product_variants?.variant_name??'—'}</td>
                <td><span className={'warehouse-tx-type '+(stocktake?'stocktake':incoming?'in':'out')}>{txLabel(String(row.tx_type),row.reference_type)}</span></td>
                <td className={'warehouse-tx-qty '+(incoming?'in':'out')}>{incoming?'+':'-'}{row.quantity}</td>
                <td><div className="warehouse-reference"><b>{row.reference_type??'—'}</b><small>{row.reference_id?String(row.reference_id).slice(0,8):'Không mã'}</small></div></td>
              </tr>
            })}</tbody>
      </table>
    </div>
  </div>
}
