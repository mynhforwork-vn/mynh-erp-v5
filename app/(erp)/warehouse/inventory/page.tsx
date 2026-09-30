import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseSectionNav } from '@/components/warehouse-section-nav'
import { adjustWarehouseInventory } from '@/lib/actions/core'
import { formatMoney } from '@/lib/format'

type SP={warehouse?:string,q?:string}

export default async function WarehouseInventoryPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase}=await requireUser()
  const query=String(sp.q??'').trim().toLowerCase()

  const [
    {data:balances,error:balanceError},
    {data:warehouses,error:warehouseError},
    {data:pendingTransfers,error:transferError},
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
  ])

  const error=balanceError??warehouseError??transferError
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
    if(!query)return true
    const hay=[row.warehouse_code,row.warehouse_name,row.sku,row.product_name,row.variant_name].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(query)
  })
  const totalUnits=rows.reduce((sum,r)=>sum+Number(r.quantity??0),0)
  const totalIncoming=rows.reduce((sum,r)=>sum+(pendingIn.get(String(r.warehouse_id)+'|'+String(r.product_variant_id))??0),0)
  const skuCount=new Set(rows.filter(r=>Number(r.quantity??0)!==0).map(r=>String(r.product_variant_id))).size
  const lowStock=rows.filter(r=>Number(r.quantity??0)<=3).length

  const {data:variantRows}=await supabase.from('product_variants')
    .select('id,variant_name,sale_price,products(id,sku,name)')
    .order('updated_at',{ascending:false})
    .limit(1000)
  const priceMap=new Map((variantRows??[]).map((v:any)=>[String(v.id),Number(v.sale_price??0)]))

  return <div className="warehouse-screen warehouse-inventory-screen">
    <header className="page-head warehouse-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Tồn kho</h1>
        <p>Tồn hiện tại theo Kho → SKU bán → Phân loại; tách biệt hoàn toàn với SKU mua trong đơn nhập.</p>
      </div>
      <div className="head-actions">
        <Link className="button" href="/warehouse/transfers">Chuyển kho</Link>
      </div>
    </header>

    <WarehouseSectionNav active="/warehouse/inventory"/>
    {error&&<div className="error-box">Không thể tải dữ liệu tồn kho: {error.message}</div>}

    <section className="warehouse-status-strip">
      <div><span>Tổng tồn</span><b>{totalUnits}</b><small>Đơn vị hàng</small></div>
      <div><span>SKU đang có</span><b>{skuCount}</b><small>Theo phân loại</small></div>
      <div className="info"><span>Đang về</span><b>{totalIncoming}</b><small>Phiếu IN_TRANSIT</small></div>
      <div className={lowStock?'warning':''}><span>Tồn thấp ≤ 3</span><b>{lowStock}</b><small>Dòng kho cần chú ý</small></div>
    </section>

    <div className="warehouse-inventory-toolbar">
      <form action="/warehouse/inventory">
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </select>
        <input name="q" defaultValue={sp.q??''} placeholder="Tìm SKU / tên / phân loại"/>
        <button className="button small" type="submit">Lọc</button>
        {(sp.warehouse||sp.q)&&<Link className="button small" href="/warehouse/inventory">Xóa lọc</Link>}
      </form>

      <details className="warehouse-adjust-stock">
        <summary className="button small">Điều chỉnh tồn</summary>
        <form action={adjustWarehouseInventory}>
          <label>Kho
            <select name="warehouse_id" required defaultValue="">
              <option value="" disabled>Chọn kho</option>
              {(warehouses??[]).map((w:any)=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </select>
          </label>
          <label>SKU
            <select name="product_variant_id" required defaultValue="">
              <option value="" disabled>Chọn SKU bán</option>
              {(variantRows??[]).map((v:any)=><option key={v.id} value={v.id}>{v.products?.sku} · {v.products?.name} · {v.variant_name}</option>)}
            </select>
          </label>
          <label>Loại
            <select name="direction" required defaultValue="IN">
              <option value="IN">Tăng tồn</option>
              <option value="OUT">Giảm tồn</option>
            </select>
          </label>
          <label>Số lượng<input name="quantity" type="number" min="1" step="1" required/></label>
          <label>Ghi chú<input name="note" placeholder="Lý do điều chỉnh"/></label>
          <button className="button primary small" type="submit">Ghi điều chỉnh</button>
        </form>
      </details>
    </div>

    <div className="card warehouse-inventory-table-card">
      <table className="table warehouse-inventory-table">
        <thead><tr>
          <th>Kho</th><th>SKU bán</th><th>Sản phẩm</th><th>Phân loại</th><th>Tồn</th><th>Đang về</th><th>Giá bán</th><th>Trạng thái</th>
        </tr></thead>
        <tbody>{!rows.length
          ? <tr><td colSpan={8} className="empty">Không có tồn kho phù hợp.</td></tr>
          : rows.map(r=>{
              const incoming=pendingIn.get(String(r.warehouse_id)+'|'+String(r.product_variant_id))??0
              const qty=Number(r.quantity??0)
              return <tr key={String(r.warehouse_id)+'-'+String(r.product_variant_id)}>
                <td><b>{r.warehouse_code}</b><small className="table-subline">{r.warehouse_name}</small></td>
                <td><b>{r.sku}</b></td>
                <td>{r.product_name}</td>
                <td>{r.variant_name}</td>
                <td className="warehouse-stock-number">{qty}</td>
                <td>{incoming||'—'}</td>
                <td className="money">{formatMoney(priceMap.get(String(r.product_variant_id))??0)}</td>
                <td>{qty<=3
                  ? <span className="status-pill orange">Tồn thấp</span>
                  : <span className="status-pill green">Sẵn hàng</span>}</td>
              </tr>
            })}</tbody>
      </table>
    </div>
  </div>
}
