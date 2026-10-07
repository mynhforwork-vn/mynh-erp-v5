import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { formatDateTime } from '@/lib/format'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'
import { ContextOrderPanel } from '@/components/context-order-panel'
import { ContextSalePanel } from '@/components/context-sale-panel'
import { fetchSaleContext } from '@/lib/sales/context'
import { WarehouseHistoryTable } from '@/components/warehouse-history-table'

type SP={
  type?:string,warehouse?:string,q?:string,ref?:string,
  tx?:string,sale?:string,saleTab?:'info'|'products'|'payment'|'history',
  order?:string,orderTab?:'info'|'tracking'|'history'
}

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
  const {supabase,user}=await requireUser()
  const role=String(user.app_metadata?.role??'viewer')
  const canOperate=['admin','operator'].includes(role)
  const q=String(sp.q??'').trim().toLowerCase()
  const txSelect='id,warehouse_id,product_variant_id,tx_type,quantity,reference_type,reference_id,created_at,warehouses(id,code,name,address),product_variants(id,variant_name,products(id,sku,name))'

  let query=supabase.from('inventory_transactions')
    .select(txSelect)
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

  let selectedTx=sp.tx?all.find(row=>String(row.id)===String(sp.tx)):null
  if(sp.tx&&!selectedTx){
    const {data:selectedTxData}=await supabase.from('inventory_transactions')
      .select(txSelect)
      .eq('id',sp.tx)
      .maybeSingle()
    selectedTx=selectedTxData??null
  }

  const saleId=selectedTx&&sp.sale&&selectedTx.reference_type==='SALE'&&String(selectedTx.reference_id)===String(sp.sale)
    ? sp.sale
    : null
  const saleContext=saleId?await fetchSaleContext(supabase,saleId):null
  const contextSale=saleContext?.sale??null
  const contextSaleTab=sp.saleTab==='products'||sp.saleTab==='payment'||sp.saleTab==='history'?sp.saleTab:'info'

  const orderId=selectedTx&&sp.order&&selectedTx.reference_type==='PURCHASE_RECEIPT'&&String(selectedTx.reference_id)===String(sp.order)
    ? sp.order
    : null
  let contextOrder:any=null
  let contextOrderItems:any[]=[]
  let contextOrderVouchers:any[]=[]
  let contextTrackingEvents:any[]=[]
  let contextOrderAudit:any[]=[]
  if(orderId){
    const [orderResult,itemResult,voucherResult]=await Promise.all([
      supabase.from('orders')
        .select('id,shopee_order_id,erp_user_id,order_date,area,shipping_service,order_status,payment_status,recipient_name,recipient_phone,recipient_address,destination_hub,cod,receive_status,warehouse_status,created_at,updated_at,archived_at,erp_users(username),shipments(id,tracking_number,carrier,current_tracking_status,is_active,last_track_at,next_track_at,replaced_at)')
        .eq('id',orderId)
        .maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id',orderId).order('created_at'),
      supabase.from('order_vouchers').select('*').eq('order_id',orderId).order('created_at'),
    ])
    contextOrder=orderResult.data
    contextOrderItems=(itemResult.data??[]) as any[]
    contextOrderVouchers=(voucherResult.data??[]) as any[]
    const shipmentIds=(contextOrder?.shipments??[]).map((item:any)=>item.id)
    if(sp.orderTab==='tracking'&&shipmentIds.length){
      const eventResult=await supabase.from('tracking_events')
        .select('id,shipment_id,normalized_status,raw_status,raw_description,raw_location,event_time')
        .in('shipment_id',shipmentIds)
        .order('event_time',{ascending:false})
        .limit(100)
      contextTrackingEvents=(eventResult.data??[]) as any[]
    }
    if(sp.orderTab==='history'){
      const auditResult=await supabase.from('audit_logs')
        .select('id,module,action,source,created_at')
        .eq('entity_id',orderId)
        .order('created_at',{ascending:false})
        .limit(100)
      contextOrderAudit=(auditResult.data??[]) as any[]
    }
  }
  const contextOrderTab=sp.orderTab==='tracking'||sp.orderTab==='history'?sp.orderTab:'info'

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

  function href(next:Record<string,string|null|undefined>={}){
    const params=new URLSearchParams()
    const current:Record<string,string|undefined>={
      type:sp.type,ref:sp.ref,warehouse:sp.warehouse,q:sp.q,
      tx:sp.tx,sale:sp.sale,saleTab:sp.saleTab,
      order:sp.order,orderTab:sp.orderTab,
    }
    for(const [key,value] of Object.entries(current))if(value)params.set(key,value)
    for(const [key,value] of Object.entries(next)){
      if(value===null||value===undefined||value==='')params.delete(key)
      else params.set(key,value)
    }
    const qs=params.toString()
    return '/warehouse/history'+(qs?'?'+qs:'')
  }

  function clearFilterHref(){
    return href({q:null,warehouse:null})
  }

  function openTransactionHref(row:any){
    return href({
      tx:String(row.id),
      sale:null,saleTab:null,
      order:null,orderTab:null,
    })
  }

  return <div className={'whx-page whx-history-page '+(selectedTx?'with-context-panel':'')}>
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
        {sp.tx&&<input type="hidden" name="tx" value={sp.tx}/>}
        {sp.sale&&<input type="hidden" name="sale" value={sp.sale}/>}
        {sp.saleTab&&<input type="hidden" name="saleTab" value={sp.saleTab}/>}
        {sp.order&&<input type="hidden" name="order" value={sp.order}/>}
        {sp.orderTab&&<input type="hidden" name="orderTab" value={sp.orderTab}/>}
        <input name="q" defaultValue={sp.q??''} placeholder="Tìm SKU / sản phẩm / chứng từ"/>
        <select name="warehouse" defaultValue={sp.warehouse??''}>
          <option value="">Tất cả kho</option>
          {(warehouses??[]).map((warehouse:any)=><option key={warehouse.id} value={warehouse.id}>
            {warehouse.code} · {warehouse.address??warehouse.name}
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

      <div className="mobile-entity-list mobile-warehouse-history-list">
        {!data.length
          ? <div className="mobile-empty-state">Chưa có giao dịch kho phù hợp.</div>
          : data.map(row=>{
              const incoming=IN_TYPES.has(String(row.tx_type))
              const stocktake=String(row.reference_type??'').startsWith('STOCKTAKE')
              return <Link
                href={openTransactionHref(row)}
                className={'mobile-warehouse-history-card '+(selectedTx?.id===row.id?'selected':'')}
                key={'mobile-'+row.id}
              >
                <div className="mobile-warehouse-history-head">
                  <div>
                    <b>{row.product_variants?.products?.sku??'—'}</b>
                    <span>{row.warehouses?.code??'—'} · {formatDateTime(row.created_at)}</span>
                  </div>
                  <span className={'whx-tx-type '+(stocktake?'stocktake':incoming?'in':'out')}>
                    {txLabel(String(row.tx_type),row.reference_type)}
                  </span>
                </div>
                <div className="mobile-warehouse-history-product">
                  <b>{row.product_variants?.products?.name??'—'}</b>
                  <span>{row.product_variants?.variant_name??'Mặc định'}</span>
                </div>
                <div className="mobile-warehouse-history-foot">
                  <div><span>Số lượng</span><b className={incoming?'in':'out'}>{incoming?'+':'-'}{row.quantity}</b></div>
                  <div><span>Chứng từ</span><b>{row.reference_type??'—'}</b></div>
                  <i>›</i>
                </div>
              </Link>
            })}
      </div>

      <WarehouseHistoryTable
        rows={data}
        selectedId={selectedTx?String(selectedTx.id):null}
        baseQuery={href({tx:null,sale:null,saleTab:null,order:null,orderTab:null}).split('?')[1]??''}
      />
    </div>

    {selectedTx&&contextSale&&<ContextSalePanel
      sale={contextSale}
      activeTab={contextSaleTab}
      receiptQR={saleContext?.receiptQR??''}
      receiptQRAmount={saleContext?.receiptQRAmount??0}
      receiptQRDescription={saleContext?.receiptQRDescription??''}
      bankConfig={saleContext?.bankConfig??null}
      canOperate={canOperate}
      parentLabel="Lịch sử kho"
      backHref={contextSaleTab!=='info'
        ? href({tx:selectedTx.id,sale:contextSale.id,saleTab:'info'})
        : href({tx:selectedTx.id,sale:null,saleTab:null})}
      closeHref={href({tx:null,sale:null,saleTab:null,order:null,orderTab:null})}
      infoHref={href({tx:selectedTx.id,sale:contextSale.id,saleTab:'info',order:null,orderTab:null})}
      productsHref={href({tx:selectedTx.id,sale:contextSale.id,saleTab:'products',order:null,orderTab:null})}
      paymentHref={href({tx:selectedTx.id,sale:contextSale.id,saleTab:'payment',order:null,orderTab:null})}
      historyHref={href({tx:selectedTx.id,sale:contextSale.id,saleTab:'history',order:null,orderTab:null})}
      openModuleHref={'/sales/history?sale='+contextSale.id}
    />}

    {selectedTx&&contextOrder&&<ContextOrderPanel
      order={contextOrder}
      items={contextOrderItems}
      vouchers={contextOrderVouchers}
      trackingEvents={contextTrackingEvents}
      auditRows={contextOrderAudit}
      activeTab={contextOrderTab}
      parentLabel="Lịch sử kho"
      backHref={contextOrderTab!=='info'
        ? href({tx:selectedTx.id,order:contextOrder.id,orderTab:'info'})
        : href({tx:selectedTx.id,order:null,orderTab:null})}
      closeHref={href({tx:null,sale:null,saleTab:null,order:null,orderTab:null})}
      infoHref={href({tx:selectedTx.id,order:contextOrder.id,orderTab:'info',sale:null,saleTab:null})}
      trackingHref={href({tx:selectedTx.id,order:contextOrder.id,orderTab:'tracking',sale:null,saleTab:null})}
      historyHref={href({tx:selectedTx.id,order:contextOrder.id,orderTab:'history',sale:null,saleTab:null})}
      openModuleHref={'/purchase/orders?range=all&order='+contextOrder.id}
    />}

    {selectedTx&&!contextSale&&!contextOrder&&<aside className="detail-panel whx-history-reference-panel mynh-slide-panel">
      <div className="panel-head context-stack-head">
        <Link className="context-stack-back" href={href({tx:null,sale:null,saleTab:null,order:null,orderTab:null})} aria-label="Quay lại">←</Link>
        <div className="context-stack-title">
          <span className="eyebrow">LỊCH SỬ KHO · GIAO DỊCH</span>
          <h2>{txLabel(String(selectedTx.tx_type),selectedTx.reference_type)}</h2>
          <small>{selectedTx.warehouses?.code??'Kho'} · {formatDateTime(selectedTx.created_at)}</small>
        </div>
        <Link className="close" href={href({tx:null,sale:null,saleTab:null,order:null,orderTab:null})} aria-label="Đóng toàn bộ">×</Link>
      </div>

      <div className="context-stack-breadcrumb">
        <span>Lịch sử kho</span><i>›</i><b>{selectedTx.product_variants?.products?.sku??'Giao dịch'}</b>
      </div>

      <div className="panel-scroll whx-history-reference-scroll">
        <div className="detail-grid compact-detail-grid">
          <div><span>Thời gian</span><b>{formatDateTime(selectedTx.created_at)}</b></div>
          <div><span>Kho</span><b>{selectedTx.warehouses?.code??'—'}</b></div>
          <div><span>Nghiệp vụ</span><b>{txLabel(String(selectedTx.tx_type),selectedTx.reference_type)}</b></div>
          <div><span>Số lượng</span><b>{IN_TYPES.has(String(selectedTx.tx_type))?'+':'-'}{selectedTx.quantity}</b></div>
          <div><span>SKU</span><b>{selectedTx.product_variants?.products?.sku??'—'}</b></div>
          <div><span>Phân loại</span><b>{selectedTx.product_variants?.variant_name??'—'}</b></div>
          <div className="full"><span>Sản phẩm</span><b>{selectedTx.product_variants?.products?.name??'—'}</b></div>
          <div><span>Loại chứng từ</span><b>{selectedTx.reference_type??'—'}</b></div>
          <div><span>Mã tham chiếu</span><b>{selectedTx.reference_id?String(selectedTx.reference_id).slice(0,12):'—'}</b></div>
        </div>

        {selectedTx.reference_type==='SALE'&&selectedTx.reference_id&&
          <div className="panel-action-row whx-history-reference-actions">
            <Link className="button primary" href={href({
              tx:selectedTx.id,
              sale:String(selectedTx.reference_id),
              saleTab:'info',
              order:null,orderTab:null,
            })}>Xem hóa đơn POS →</Link>
          </div>
        }

        {selectedTx.reference_type==='PURCHASE_RECEIPT'&&selectedTx.reference_id&&
          <div className="panel-action-row whx-history-reference-actions">
            <Link className="button primary" href={href({
              tx:selectedTx.id,
              order:String(selectedTx.reference_id),
              orderTab:'info',
              sale:null,saleTab:null,
            })}>Xem đơn nhập →</Link>
          </div>
        }

        {String(selectedTx.reference_type??'').startsWith('STOCKTAKE')&&
          <div className="panel-note-row"><span>Luồng liên kết</span><b>Kiểm kê kho · không rời màn hình lịch sử</b></div>
        }
        {String(selectedTx.reference_type??'').startsWith('MANUAL_ADJUSTMENT')&&
          <div className="panel-note-row"><span>Ghi chú điều chỉnh</span><b>{String(selectedTx.reference_type).replace('MANUAL_ADJUSTMENT:','').trim()||'—'}</b></div>
        }
      </div>
    </aside>}

  </div>
}
