import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseInventoryWorkspace } from '@/components/warehouse-inventory-workspace'
import { WarehouseStockTools } from '@/components/warehouse-stock-tools'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'

type SP={warehouse?:string,q?:string,status?:string}

const IN_TYPES=new Set(['IN','TRANSFER_IN','RETURN','ADJUSTMENT_IN'])
const OUT_TYPES=new Set(['OUT','TRANSFER_OUT','SALE','ADJUSTMENT_OUT'])

function todayStartVN(){
  const now=new Date()
  const shifted=new Date(now.getTime()+7*60*60*1000)
  const y=shifted.getUTCFullYear()
  const m=String(shifted.getUTCMonth()+1).padStart(2,'0')
  const d=String(shifted.getUTCDate()).padStart(2,'0')
  return new Date(y+'-'+m+'-'+d+'T00:00:00+07:00').toISOString()
}

export default async function WarehouseInventoryPage({searchParams}:{searchParams:Promise<SP>}){
  const sp=await searchParams
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canOperate=['admin','operator'].includes(role)
  const q=String(sp.q??'').trim().toLowerCase()

  const [
    {data:balances,error:balanceError},
    {data:warehouses,error:warehouseError},
    {data:variants,error:variantError},
    {data:transfers,error:transferError},
    {data:transactions,error:transactionError},
    {data:todayTransactions,error:todayError},
    {data:settings,error:settingsError},
  ]=await Promise.all([
    supabase.from('inventory_balances')
      .select('warehouse_id,warehouse_code,warehouse_name,product_variant_id,product_id,sku,product_name,variant_name,quantity')
      .order('warehouse_code')
      .order('sku')
      .limit(3000),
    supabase.from('warehouses')
      .select('id,code,name,address')
      .eq('is_active',true)
      .order('code')
      .limit(100),
    supabase.from('product_variants')
      .select('id,sale_price')
      .limit(2000),
    supabase.from('transfer_batches')
      .select('id,status,created_at,from_warehouse:warehouses!transfer_batches_from_warehouse_id_fkey(code),to_warehouse:warehouses!transfer_batches_to_warehouse_id_fkey(code),to_warehouse_id,transfer_items(quantity,product_variant_id,product_variants(variant_name,products(sku,name)))')
      .order('created_at',{ascending:false})
      .limit(100),
    supabase.from('inventory_transactions')
      .select('id,warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_at')
      .order('created_at',{ascending:false})
      .limit(1500),
    supabase.from('inventory_transactions')
      .select('warehouse_id,product_variant_id,tx_type,quantity')
      .gte('created_at',todayStartVN())
      .limit(5000),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id')
      .eq('id','main')
      .single(),
  ])

  const error=balanceError??warehouseError??variantError??transferError??transactionError??todayError??settingsError
  const all=(balances??[]) as any[]
  const priceMap=new Map((variants??[]).map((row:any)=>[String(row.id),Number(row.sale_price??0)]))

  const incomingMap=new Map<string,number>()
  for(const transfer of (transfers??[]) as any[]){
    if(transfer.status!=='IN_TRANSIT')continue
    for(const item of transfer.transfer_items??[]){
      const key=String(transfer.to_warehouse_id)+'|'+String(item.product_variant_id)
      incomingMap.set(key,(incomingMap.get(key)??0)+Number(item.quantity??0))
    }
  }

  const scopeRows=all.filter(row=>{
    if(sp.warehouse&&String(row.warehouse_id)!==sp.warehouse)return false
    if(!q)return true
    const hay=[row.sku,row.product_name,row.variant_name,row.warehouse_code,row.warehouse_name]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })

  const totalUnits=scopeRows.reduce((sum,row)=>sum+Number(row.quantity??0),0)
  const skuCount=new Set(scopeRows.map(row=>String(row.product_variant_id))).size
  const normalCount=scopeRows.filter(row=>Number(row.quantity??0)>3).length
  const lowCount=scopeRows.filter(row=>Number(row.quantity??0)>0&&Number(row.quantity??0)<=3).length
  const outCount=scopeRows.filter(row=>Number(row.quantity??0)===0).length
  const scopeVariantKeys=new Set(scopeRows.map(row=>String(row.warehouse_id)+'|'+String(row.product_variant_id)))
  const todayScope=((todayTransactions??[]) as any[]).filter(tx=>{
    if(sp.warehouse&&String(tx.warehouse_id)!==sp.warehouse)return false
    if(q&&!scopeVariantKeys.has(String(tx.warehouse_id)+'|'+String(tx.product_variant_id)))return false
    return true
  })
  const todayIn=todayScope
    .filter(tx=>IN_TYPES.has(String(tx.tx_type)))
    .reduce((sum,tx)=>sum+Number(tx.quantity??0),0)
  const todayOut=todayScope
    .filter(tx=>OUT_TYPES.has(String(tx.tx_type)))
    .reduce((sum,tx)=>sum+Number(tx.quantity??0),0)

  const filtered=scopeRows.filter(row=>{
    const qty=Number(row.quantity??0)
    if(sp.status==='normal'&&qty<=3)return false
    if(sp.status==='low'&&(qty<=0||qty>3))return false
    if(sp.status==='out'&&qty!==0)return false
    return true
  })

  function inventoryHref(status?:string|null){
    const params=new URLSearchParams()
    if(sp.q)params.set('q',sp.q)
    if(sp.warehouse)params.set('warehouse',sp.warehouse)
    if(status)params.set('status',status)
    const qs=params.toString()
    return '/warehouse/inventory'+(qs?'?'+qs:'')
  }

  const workspaceRows=filtered.map(row=>({
    warehouse_id:String(row.warehouse_id),
    warehouse_code:String(row.warehouse_code??'—'),
    warehouse_name:String(row.warehouse_name??'—'),
    product_variant_id:String(row.product_variant_id),
    sku:String(row.sku??'—'),
    product_name:String(row.product_name??'—'),
    variant_name:String(row.variant_name??'Mặc định'),
    quantity:Number(row.quantity??0),
    incoming:incomingMap.get(String(row.warehouse_id)+'|'+String(row.product_variant_id))??0,
    sale_price:priceMap.get(String(row.product_variant_id))??0,
  }))

  const toolBalances=all.map(row=>({
    warehouse_id:String(row.warehouse_id),
    warehouse_code:String(row.warehouse_code??'—'),
    product_variant_id:String(row.product_variant_id),
    sku:String(row.sku??'—'),
    product_name:String(row.product_name??'—'),
    variant_name:String(row.variant_name??'Mặc định'),
    quantity:Number(row.quantity??0),
  }))

  return <div className="whx-page whx-inventory-page">
    <header className="page-head whx-page-head">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Tồn kho</h1>
        <p>Tồn thực tế theo SKU bán tại Kho nhận; bán hàng, kiểm kê và điều chỉnh đều ghi lịch sử.</p>
      </div>
      <div className="head-actions">
        {canOperate&&<WarehouseReceivingSettings
          warehouses={(warehouses??[]) as any[]}
          defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id??null}
        />}
      </div>
    </header>

    {error&&<div className="error-box">Không thể tải dữ liệu tồn kho: {error.message}</div>}

    <section className="whx-kpi-grid seven">
      <Link href={inventoryHref(null)} className={!sp.status?'active':''}><span>Tổng SKU</span><b>{skuCount}</b><small>SKU trong phạm vi đang lọc</small></Link>
      <Link href={inventoryHref(null)} className="success"><span>Tổng SL tồn</span><b>{totalUnits}</b><small>Đơn vị hàng trong phạm vi</small></Link>
      <Link href={inventoryHref('normal')} className={sp.status==='normal'?'active':''}><span>Bình thường</span><b>{normalCount}</b><small>Tồn trên ngưỡng cảnh báo</small></Link>
      <Link href={inventoryHref('low')} className={(lowCount?'warning ':'')+(sp.status==='low'?'active':'')}><span>Tồn thấp</span><b>{lowCount}</b><small>Từ 1 đến 3 đơn vị</small></Link>
      <Link href={inventoryHref('out')} className={(outCount?'danger ':'')+(sp.status==='out'?'active':'')}><span>Hết hàng</span><b>{outCount}</b><small>Tồn bằng 0</small></Link>
      <Link href={'/warehouse/history?type=IN'+(sp.warehouse?'&warehouse='+encodeURIComponent(sp.warehouse):'')} className="info"><span>Nhập hôm nay</span><b>{todayIn}</b><small>Tổng SL ghi tăng trong ngày</small></Link>
      <Link href={'/warehouse/history?type=SALE'+(sp.warehouse?'&warehouse='+encodeURIComponent(sp.warehouse):'')} className="info"><span>Xuất hôm nay</span><b>{todayOut}</b><small>Tổng SL ghi giảm trong ngày</small></Link>
    </section>

    <div className="whx-toolbar">
      <form action="/warehouse/inventory">
        <input name="q" defaultValue={sp.q??''} placeholder="Tìm SKU / tên sản phẩm / phân loại"/>
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((warehouse:any)=><option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} · {warehouse.address??warehouse.name}
          </option>)}
        </select>
        <select name="status" defaultValue={sp.status??''}>
          <option value="">Tất cả trạng thái</option>
          <option value="normal">Bình thường</option>
          <option value="low">Tồn thấp</option>
          <option value="out">Hết hàng</option>
        </select>
        <button className="button small" type="submit">Lọc</button>
        {(sp.q||sp.warehouse||sp.status)&&<Link className="button small" href="/warehouse/inventory">Xóa lọc</Link>}
      </form>

      {canOperate&&<WarehouseStockTools
        warehouses={(warehouses??[]) as any[]}
        balances={toolBalances}
        recentTransfers={(transfers??[]) as any[]}
        defaultReceivingWarehouseId={(settings as any)?.default_receiving_warehouse_id??null}
      />}
    </div>

    <WarehouseInventoryWorkspace
      rows={workspaceRows}
      transactions={(transactions??[]) as any[]}
    />
  </div>
}
