import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime } from '@/lib/format'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'

type SP={type?:string,warehouse?:string,q?:string,ref?:string}

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
  const q=String(sp.q??'').trim().toLowerCase()

  let query=supabase.from('inventory_transactions')
    .select('id,warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_at,warehouses(id,code,name),product_variants(id,variant_name,products(id,sku,name))')
    .order('created_at',{ascending:false})
    .limit(1000)

  if(sp.type)query=query.eq('tx_type',sp.type as any)
  if(sp.warehouse)query=query.eq('warehouse_id',sp.warehouse)
  if(sp.ref==='stocktake')query=query.ilike('reference_type','STOCKTAKE%')

  const [
    {data:rows,error},
    {data:warehouses,error:warehouseError},
    {data:settings,error:settingsError},
  ]=await Promise.all([
    query,
    supabase.from('warehouses')
      .select('id,code,name,address')
      .eq('is_active',true)
      .order('code')
      .limit(100),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id')
      .eq('id','main')
      .single(),
  ])

  const all=(rows??[]) as any[]
  const data=all.filter(row=>{
    if(!q)return true
    const hay=[
      row.warehouses?.code,
      row.warehouses?.name,
      row.product_variants?.products?.sku,
      row.product_variants?.products?.name,
      row.product_variants?.variant_name,
      row.reference_type,
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })

  const inQty=data.filter(row=>IN_TYPES.has(String(row.tx_type)))
    .reduce((sum,row)=>sum+Number(row.quantity??0),0)
  const outQty=data.filter(row=>OUT_TYPES.has(String(row.tx_type)))
    .reduce((sum,row)=>sum+Number(row.quantity??0),0)
  const adjustmentCount=data.filter(row=>
    ['ADJUSTMENT_IN','ADJUSTMENT_OUT'].includes(String(row.tx_type))&&
    !String(row.reference_type??'').startsWith('STOCKTAKE')
  ).length
  const stocktakeCount=data.filter(row=>String(row.reference_type??'').startsWith('STOCKTAKE')).length

  function href(next:{type?:string|null,ref?:string|null}={}){
    const params=new URLSearchParams()
    const type=Object.prototype.hasOwnProperty.call(next,'type')?next.type:sp.type
    const ref=Object.prototype.hasOwnProperty.call(next,'ref')?next.ref:sp.ref
    if(type)params.set('type',type)
    if(ref)params.set('ref',ref)
    if(sp.warehouse)params.set('warehouse',sp.warehouse)
    if(sp.q)params.set('q',sp.q)
    const qs=params.toString()
    return '/warehouse/history'+(qs?'?'+qs:'')
  }

  function clearFilterHref(){
    const params=new URLSearchParams()
    if(sp.type)params.set('type',sp.type)
    if(sp.ref)params.set('ref',sp.ref)
    const qs=params.toString()
    return '/warehouse/history'+(qs?'?'+qs:'')
  }

  return <div className="whx-page">
    <header className="page-head whx-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Lịch sử kho</h1>
        <p>Ledger toàn bộ biến động nhập, xuất, bán, kiểm kê, điều chỉnh và chuyển kho theo SKU.</p>
      </div>
      <div className="head-actions">
        <WarehouseReceivingSettings
          warehouses={(warehouses??[]) as any[]}
          defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id??null}
        />
      </div>
    </header>

    {(error||warehouseError||settingsError)&&<div className="error-box">
      Không thể tải lịch sử kho: {(error??warehouseError??settingsError)?.message}
    </div>}

    <section className="whx-kpi-grid five">
      <div><span>Giao dịch</span><b>{data.length}</b><small>Tối đa 1.000 dòng gần nhất</small></div>
      <div className="success"><span>Tổng nhập</span><b>+{inQty}</b><small>SL tăng trong tập đang lọc</small></div>
      <div className="info"><span>Tổng xuất</span><b>-{outQty}</b><small>SL giảm trong tập đang lọc</small></div>
      <div className="warning"><span>Điều chỉnh</span><b>{adjustmentCount}</b><small>Phát sinh ngoài kiểm kê</small></div>
      <div><span>Kiểm kê</span><b>{stocktakeCount}</b><small>Giao dịch chênh lệch kiểm kê</small></div>
    </section>

    <div className="whx-toolbar whx-history-toolbar">
      <div className="whx-history-tabs">
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
        <input name="q" defaultValue={sp.q??''} placeholder="Tìm SKU / sản phẩm / chứng từ"/>
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((warehouse:any)=><option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} · {warehouse.name}
          </option>)}
        </select>
        <button className="button small" type="submit">Lọc</button>
        {(sp.q||sp.warehouse)&&<Link className="button small" href={clearFilterHref()}>Xóa lọc</Link>}
      </form>
    </div>

    <div className="whx-table-card">
      <div className="whx-table-head">
        <div>
          <h2>Biến động tồn kho</h2>
          <span>Mọi thay đổi được ghi thành transaction; không sửa trực tiếp số tồn.</span>
        </div>
      </div>

      <div className="whx-table-scroll">
        <table className="table whx-table">
          <thead><tr>
            <th>Thời gian</th>
            <th>Kho</th>
            <th>SKU bán</th>
            <th>Sản phẩm</th>
            <th>Phân loại</th>
            <th>Nghiệp vụ</th>
            <th>SL</th>
            <th>Chứng từ</th>
          </tr></thead>
          <tbody>
            {!data.length
              ? <tr><td colSpan={8} className="empty">Chưa có giao dịch kho phù hợp.</td></tr>
              : data.map(row=>{
                  const incoming=IN_TYPES.has(String(row.tx_type))
                  const stocktake=String(row.reference_type??'').startsWith('STOCKTAKE')
                  return <tr key={row.id}>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td><b>{row.warehouses?.code??'—'}</b></td>
                    <td><b className="whx-link-text">{row.product_variants?.products?.sku??'—'}</b></td>
                    <td>{row.product_variants?.products?.name??'—'}</td>
                    <td>{row.product_variants?.variant_name??'—'}</td>
                    <td><span className={'whx-tx-type '+(stocktake?'stocktake':incoming?'in':'out')}>
                      {txLabel(String(row.tx_type),row.reference_type)}
                    </span></td>
                    <td className={'whx-tx-qty '+(incoming?'in':'out')}>{incoming?'+':'-'}{row.quantity}</td>
                    <td>
                      <div className="whx-reference">
                        <b>{row.reference_type??'—'}</b>
                        <span>{row.reference_id?String(row.reference_id).slice(0,8):'Không mã'}</span>
                      </div>
                    </td>
                  </tr>
                })}
          </tbody>
        </table>
      </div>
    </div>
  </div>
}
