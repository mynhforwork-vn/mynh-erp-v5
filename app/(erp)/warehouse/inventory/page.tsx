import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'
import { WarehouseInventoryTools } from '@/components/warehouse-inventory-tools'
import { formatMoney } from '@/lib/format'

type SP={warehouse?:string,q?:string,status?:string}

const IN_TYPES=new Set(['IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN'])
const OUT_TYPES=new Set(['OUT','TRANSFER_OUT','SALE','ADJUSTMENT_OUT'])

function vnTodayStartIso(){
  const now=new Date()
  const shifted=new Date(now.getTime()+7*60*60*1000)
  const y=shifted.getUTCFullYear()
  const m=String(shifted.getUTCMonth()+1).padStart(2,'0')
  const d=String(shifted.getUTCDate()).padStart(2,'0')
  return new Date(`${y}-${m}-${d}T00:00:00+07:00`).toISOString()
}

export default async function WarehouseInventoryPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()
  const query=String(sp.q??'').trim().toLowerCase()

  const [
    {data:balances,error:balanceError},
    {data:warehouses,error:warehouseError},
    {data:pendingTransfers,error:transferError},
    {data:todayTx,error:todayTxError},
    {data:variantRows,error:variantError},
  ]=await Promise.all([
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,warehouse_name,product_variant_id,product_id,sku,product_name,variant_name,quantity')
      .order('warehouse_code')
      .order('sku')
      .limit(3000),
    supabase.from('warehouses').select('id,code,name').eq('is_active',true).order('code').limit(100),
    supabase.from('transfer_batches')
      .select('id,status,to_warehouse_id,transfer_items(product_variant_id,quantity)')
      .eq('status','IN_TRANSIT')
      .limit(500),
    supabase.from('inventory_transactions')
      .select('tx_type,quantity,reference_type,created_at')
      .gte('created_at',vnTodayStartIso())
      .limit(5000),
    supabase.from('product_variants')
      .select('id,variant_name,sale_price,products(id,sku,name)')
      .order('updated_at',{ascending:false})
      .limit(1500),
  ])

  const error=balanceError??warehouseError??transferError??todayTxError??variantError
  const pendingIn=new Map<string,number>()
  for(const transfer of (pendingTransfers??[]) as any[]){
    for(const item of transfer.transfer_items??[]){
      const key=String(transfer.to_warehouse_id)+'|'+String(item.product_variant_id)
      pendingIn.set(key,(pendingIn.get(key)??0)+Number(item.quantity??0))
    }
  }

  const all=(balances??[]) as any[]
  const rows=all.filter(row=>{
    if(sp.warehouse&&String(row.warehouse_id)!==sp.warehouse)return false
    const qty=Number(row.quantity??0)
    if(sp.status==='normal'&&qty<=3)return false
    if(sp.status==='low'&&(qty<=0||qty>3))return false
    if(sp.status==='out'&&qty!==0)return false
    if(!query)return true
    const hay=[row.warehouse_code,row.warehouse_name,row.sku,row.product_name,row.variant_name].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(query)
  })

  const totalUnits=all.reduce((sum,r)=>sum+Number(r.quantity??0),0)
  const skuCount=new Set(all.map(r=>String(r.product_variant_id))).size
  const normalCount=all.filter(r=>Number(r.quantity??0)>3).length
  const lowStock=all.filter(r=>Number(r.quantity??0)>0&&Number(r.quantity??0)<=3).length
  const outStock=all.filter(r=>Number(r.quantity??0)===0).length
  const todayIn=((todayTx??[]) as any[]).filter(x=>IN_TYPES.has(String(x.tx_type))).reduce((s,x)=>s+Number(x.quantity??0),0)
  const todayOut=((todayTx??[]) as any[]).filter(x=>OUT_TYPES.has(String(x.tx_type))).reduce((s,x)=>s+Number(x.quantity??0),0)

  const priceMap=new Map((variantRows??[]).map((v:any)=>[String(v.id),Number(v.sale_price??0)]))

  function href(extra:Record<string,string|undefined|null>={}){
    const p=new URLSearchParams()
    if(sp.warehouse)p.set('warehouse',sp.warehouse)
    if(sp.q)p.set('q',sp.q)
    if(sp.status)p.set('status',sp.status)
    for(const [k,v] of Object.entries(extra)){
      if(v===null||v===undefined||v==='')p.delete(k)
      else p.set(k,v)
    }
    const qs=p.toString()
    return '/warehouse/inventory'+(qs?'?'+qs:'')
  }

  return <div className="warehouse-screen warehouse-inventory-screen warehouse-v2">
    <header className="page-head warehouse-page-head warehouse-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Tồn kho</h1>
        <p>Tồn thực tế theo Kho nhận → SKU bán → Phân loại; bán hàng và mọi điều chỉnh đều ghi lịch sử theo SKU.</p>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/inventory"/>
    {error&&<div className="error-box">Không thể tải dữ liệu tồn kho: {error.message}</div>}

    <section className="warehouse-status-strip warehouse-status-strip-7 warehouse-kpi-row">
      <Link href={href({status:null})}><span>Tổng SKU</span><b>{skuCount}</b><small>SKU bán đang quản lý</small></Link>
      <Link href={href({status:null})} className="success"><span>Tổng SL tồn</span><b>{totalUnits}</b><small>Đơn vị hàng hiện có</small></Link>
      <Link href={href({status:'normal'})}><span>Bình thường</span><b>{normalCount}</b><small>Tồn trên ngưỡng cảnh báo</small></Link>
      <Link href={href({status:'low'})} className={lowStock?'warning':''}><span>Tồn thấp</span><b>{lowStock}</b><small>Từ 1 đến 3 đơn vị</small></Link>
      <Link href={href({status:'out'})} className={outStock?'danger':''}><span>Hết hàng</span><b>{outStock}</b><small>Tồn bằng 0</small></Link>
      <Link href="/warehouse/history?type=IN" className="info"><span>Nhập hôm nay</span><b>{todayIn}</b><small>Tổng SL ghi tăng trong ngày</small></Link>
      <Link href="/warehouse/history?type=SALE" className="info"><span>Xuất hôm nay</span><b>{todayOut}</b><small>Tổng SL ghi giảm trong ngày</small></Link>
    </section>

    <div className="warehouse-inventory-toolbar warehouse-toolbar-v2">
      <form action="/warehouse/inventory">
        <input name="q" defaultValue={sp.q??''} placeholder="Tìm SKU / tên sản phẩm / phân loại"/>
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status??''}>
          <option value="">Tất cả trạng thái</option>
          <option value="normal">Bình thường</option>
          <option value="low">Tồn thấp</option>
          <option value="out">Hết hàng</option>
        </select>
        <button className="button small" type="submit">Lọc</button>
        {(sp.warehouse||sp.q||sp.status)&&<Link className="button small" href="/warehouse/inventory">Xóa lọc</Link>}
      </form>

      <WarehouseInventoryTools
        warehouses={(warehouses??[]) as any[]}
        variants={(variantRows??[]) as any[]}
      />
    </div>

    <div className="card warehouse-inventory-table-card warehouse-table-surface">
      <div className="warehouse-table-head">
        <div><h2>Danh sách tồn kho</h2><span>{rows.length} dòng phù hợp bộ lọc hiện tại</span></div>
        <Link className="warehouse-inline-link" href="/warehouse/history">Lịch sử nhập / xuất →</Link>
      </div>
      <table className="table warehouse-inventory-table">
        <thead><tr>
          <th>SKU bán</th><th>Sản phẩm</th><th>Phân loại</th><th>Kho</th><th>Tồn</th><th>Đang về</th><th>Khả dụng</th><th>Giá bán</th><th>Trạng thái</th>
        </tr></thead>
        <tbody>{!rows.length
          ? <tr><td colSpan={9} className="empty">Không có tồn kho phù hợp.</td></tr>
          : rows.map(r=>{
              const incoming=pendingIn.get(String(r.warehouse_id)+'|'+String(r.product_variant_id))??0
              const qty=Number(r.quantity??0)
              return <tr key={String(r.warehouse_id)+'-'+String(r.product_variant_id)}>
                <td><b className="warehouse-sku-code">{r.sku}</b></td>
                <td>{r.product_name}</td>
                <td>{r.variant_name}</td>
                <td><div className="warehouse-order-cell"><b>{r.warehouse_code}</b><small>{r.warehouse_name}</small></div></td>
                <td className="warehouse-stock-number">{qty}</td>
                <td>{incoming||'—'}</td>
                <td className="warehouse-stock-number">{qty}</td>
                <td className="money">{formatMoney(priceMap.get(String(r.product_variant_id))??0)}</td>
                <td>{qty===0
                  ? <span className="status-pill red">Hết hàng</span>
                  : qty<=3
                    ? <span className="status-pill orange">Tồn thấp</span>
                    : <span className="status-pill green">Bình thường</span>}</td>
              </tr>
            })}</tbody>
      </table>
    </div>
  </div>
}
