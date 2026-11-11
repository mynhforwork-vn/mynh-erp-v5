import Link from 'next/link'
import { requireUser } from '@/lib/supabase/auth'
import { WarehouseIntakeWorkspace } from '@/components/warehouse-intake-workspace'
import { WarehouseReceivingSettings } from '@/components/warehouse-receiving-settings'
import { PurchaseDateFilter } from '@/components/purchase-date-filter'
import {indexHistoricalSkuMappings,suggestSkusFromHistory,type HistoricSkuMapping,type HistoricalSuggestion}
  from '@/lib/warehouse-sku-suggestions'
import '@/app/styles/warehouse-intake-preview.css'
import '@/app/styles/warehouse-intake-detail-preview.css'

function batchOf(row: any) {
  const detail = Array.isArray(row.receive_batch_details)
    ? row.receive_batch_details[0] : row.receive_batch_details
  const value = detail?.receive_batches
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

type ReceiptPeriod = 'all' | 'today' | 'week' | '7d' | '30d' | 'month' | 'year' | 'custom'
type SP = {
  state?: 'all' | 'pending' | 'incomplete' | 'missing' | 'ready' | 'done'
  received_range?: ReceiptPeriod
  from?: string
  to?: string
}
function validIsoDay(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value ? value : ''
}
function vietnamDay(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const take = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return take('year') + '-' + take('month') + '-' + take('day')
}
function subtractDays(day: string, count: number): string {
  const date = new Date(day + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() - count)
  return date.toISOString().slice(0, 10)
}
function receiptDay(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : vietnamDay(d)
}

export default async function WarehouseReceivePage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams
  const state = params.state ?? 'all'
  const requestedPeriod = params.received_range ?? 'all'
  const receivedPeriod: ReceiptPeriod = (['today','week','7d','30d','month','year','custom'] as const).includes(requestedPeriod as any)
    ? requestedPeriod : 'all'
  const dateFrom = validIsoDay(params.from)
  const dateTo = validIsoDay(params.to)
  const today = vietnamDay(new Date())
  const weekdayFromMonday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7
  const sinceDay = receivedPeriod === 'today' ? today
    : receivedPeriod === 'week' ? subtractDays(today, weekdayFromMonday)
    : receivedPeriod === '7d' ? subtractDays(today, 6)
    : receivedPeriod === '30d' ? subtractDays(today, 29)
    : receivedPeriod === 'month' ? today.slice(0, 8) + '01'
    : receivedPeriod === 'year' ? today.slice(0, 4) + '-01-01'
    : receivedPeriod === 'custom' ? dateFrom : ''
  const untilDay = ['today','week','7d','30d','month','year'].includes(receivedPeriod)
    ? today : receivedPeriod === 'custom' ? dateTo : ''
  const invalidDateRange = Boolean(sinceDay && untilDay && sinceDay > untilDay)
  const { supabase,user } = await requireUser()
  // Cloudflare Preview has ERP_WAREHOUSE_V2_LIVE=false; only Production will
  // enable writes, after the additive DB migration and release gates are met.
  const isLive=process.env.ERP_WAREHOUSE_V2_LIVE==='true'
  const canWrite=isLive&&['admin','operator'].includes(String(user.app_metadata?.role??'viewer'))
  const canCorrectFinalizedSku=isLive&&process.env.ERP_POST_RECEIPT_SKU_LIVE==='true'&&
    String(user.app_metadata?.role??'viewer')==='admin'
  // Count every non-archived received order, including processed and skipped ones.
  // Paginate deterministically because Supabase/PostgREST caps each response.
  async function loadReceivedOrders(){
    const batchSize=500
    const collected:any[]=[]
    for(let page=0;page<100;page++){
      const offset=page*batchSize
      const {data,error}=await supabase.from('orders')
      .select([
        'id,shopee_order_id,cod,prepaid_amount,prepaid_source_type,prepaid_source_label,order_date,created_at,shipping_service,receive_status,warehouse_status,order_status,payment_status',
        'recipient_name,recipient_phone,recipient_address,area,destination_hub',
        'erp_users(username)',
        'shipments(carrier,tracking_number,current_tracking_status,is_active)',
        'order_vouchers(voucher_code,voucher_name,voucher_type,voucher_tag)',
        'receive_batch_details(id,receive_batch_id,receive_batches(id,warehouse_id,received_at,warehouses(id,code,name,address)))',
        'order_items(id,sku,product_name,variant,quantity,original_price,final_price,product_variant_id,inventory_multiplier,product_variants(id,variant_name,sale_price,products(id,sku,name)))',
      ].join(','))
      .is('archived_at', null)
      .eq('receive_status', 'RECEIVED')
      .order('order_date', { ascending: false })
      .order('id', { ascending: true })
      .range(offset,offset+batchSize-1)
      if(error)return {data:collected,error}
      const part=(data??[]) as any[]
      collected.push(...part)
      if(part.length<batchSize)return {data:collected,error:null}
    }
    return {data:collected,error:{message:'Danh sách nhận hàng vượt giới hạn 50.000 đơn. Cần phân trang phía máy chủ.'}}
  }

  // SKU products are independent from their variants. A legacy SKU can
  // receive a new classification even if it has no recent variant mapping.
  async function loadSkuProducts(){
    const collected:Array<{id:string,sku:string,name:string}>=[]
    for(let page=0;page<100;page++){
      const offset=page*500
      const {data,error}=await supabase.from('products')
        .select('id,sku,name').order('sku',{ascending:true})
        .order('id',{ascending:true}).range(offset,offset+499)
      if(error)return {data:collected,error}
      const batch=data??[]
      collected.push(...batch)
      if(batch.length<500)return {data:collected,error:null}
    }
    return {data:collected,error:{message:'Danh mục SKU quá lớn; vui lòng thu hẹp phạm vi tải.'}}
  }

  const [
    { data: orders, error: ordersError },
    { data: variants, error: variantsError },
    { data: skuProducts, error: skuProductsError },
    { data: auditLogs, error: auditError },
    { data: receiptLinks, error: receiptLinksError },
    { data: receiptBatches, error: receiptBatchesError },
    { data: receivingWarehouses, error: receivingWarehousesError },
    { data: settings, error: settingsError },
    { data: recentMappings, error: mappingError },
  ] = await Promise.all([
    loadReceivedOrders(),
    (process.env.ERP_SKU_CATALOG_LIVE==='true'?
      supabase.from('product_variants')
        .select('id,variant_name,sale_price,products(id,sku,name)')
        .eq('is_active',true).order('updated_at',{ascending:false}).limit(5000):
      supabase.from('product_variants')
        .select('id,variant_name,sale_price,products(id,sku,name)')
        .order('updated_at',{ascending:false}).limit(5000)),
    loadSkuProducts(),
    supabase.from('audit_logs')
      .select('id,entity_id,action,created_at,old_value,new_value')
      .eq('module', 'WAREHOUSE').eq('entity_type', 'ORDER')
      .order('created_at', { ascending: false }).limit(800),
    supabase.from('receive_batch_details')
      .select('order_id,receive_batch_id').limit(1500),
    supabase.from('receive_batches')
      .select('id,warehouse_id,received_at').limit(1000),
    supabase.from('warehouses')
      .select('id,code,name,address,is_active').in('code', ['BG', 'HN']).limit(10),
    supabase.from('warehouse_settings')
      .select('default_receiving_warehouse_id').eq('id', 'main').single(),
    // Same read-only suggestion source already used by the Production receiving screen.
    supabase.from('order_items')
      .select('id,order_id,sku,product_name,variant,product_variant_id,inventory_multiplier,created_at,product_variants(id,variant_name,sale_price,products(id,sku,name))')
      .not('product_variant_id', 'is', null)
      .order('created_at', { ascending: false }).limit(3000),
  ])
  const error = ordersError ?? variantsError ?? skuProductsError ?? auditError ??
    receiptLinksError ?? receiptBatchesError ?? receivingWarehousesError ?? settingsError ?? mappingError

  // Read-only reconciliation from the confirmed receiving records. Do not
  // infer warehouse from HUB/delivery destination or place of residence.
  // This also protects the Preview from an absent nested PostgREST relation.
  const batchMap = new Map((receiptBatches ?? []).map(batch => [batch.id, batch]))
  const warehouseMap = new Map((receivingWarehouses ?? []).map(warehouse => [warehouse.id, warehouse]))
  const linksMap = new Map<string, Array<{ receive_batch_id: string }>>()
  for (const link of receiptLinks ?? []) {
    const previous = linksMap.get(link.order_id) ?? []
    previous.push({ receive_batch_id: link.receive_batch_id })
    linksMap.set(link.order_id, previous)
  }
  const allRows = ((orders ?? []) as any[]).map(order => {
    const links = linksMap.get(order.id) ?? []
    if (links.length !== 1) return {
      ...order,
      receive_batch_details: links.length === 0 ? order.receive_batch_details : [],
    }
    const batch = batchMap.get(links[0].receive_batch_id)
    const warehouse = batch ? warehouseMap.get(batch.warehouse_id) : null
    if (!batch || !warehouse || !['BG', 'HN'].includes(warehouse.code)) {
      return { ...order, receive_batch_details: [] }
    }
    return { ...order, receive_batch_details: [{
      receive_batches: {
        warehouse_id: warehouse.id, received_at: batch.received_at,
        warehouses: { id: warehouse.id, code: warehouse.code, name: warehouse.name, address: warehouse.address },
      },
    }] }
  })
  // The filter uses the RECEIVED timestamp on the confirmed batch,
  // NEVER the purchase/order date or delivery HUB.
  const rows = invalidDateRange ? [] : allRows.filter(row => {
    if (receivedPeriod === 'all') return true
    const day = receiptDay(batchOf(row)?.received_at)
    return !!day && (!sinceDay || day >= sinceDay) && (!untilDay || day <= untilDay)
  })

  // Historical suggestions are only produced from persisted, previously
  // mapped lines of OTHER orders. Multiple mappings remain separate options.
  // No suggestion is applied automatically and Preview never writes mappings.
  // The nested PostgREST relation may be represented as an array in generated
  // types; normalize both relational shapes before calculating history.
  const history:HistoricSkuMapping[]=((recentMappings??[]) as unknown as any[]).map(item=>{
    const variant=Array.isArray(item.product_variants)?item.product_variants[0]:item.product_variants
    const product=Array.isArray(variant?.products)?variant.products[0]:variant?.products
    return {...item,product_variants:variant?{...variant,products:product??null}:null}
  })
  const historicIndex=indexHistoricalSkuMappings(history)
  // Preserve SKUs found in earlier mappings even if not within the newest
  // 1,500 edited variants. Existing catalog entry is still checked on click.
  const knownVariants=new Map<string,any>()
  for(const variant of (variants??[]) as any[])knownVariants.set(variant.id,variant)
  for(const source of history){
    const variant=source.product_variants
    if(variant?.id&&!knownVariants.has(variant.id)&&
      process.env.ERP_SKU_CATALOG_LIVE!=='true')knownVariants.set(variant.id,variant)
  }
  const allVariants=[...knownVariants.values()]
  const suggestions:Record<string,HistoricalSuggestion[]>={}
  for(const order of rows)for(const item of order.order_items??[]){
    if(item.product_variant_id)continue
    const candidates=suggestSkusFromHistory({...item,order_id:order.id},historicIndex,3)
    if(candidates.length)suggestions[item.id]=candidates
  }

  const assignedCount = rows.filter(row => {
    const batch = row.receive_batch_details?.[0]?.receive_batches
    return batch?.warehouses?.code === 'BG' || batch?.warehouses?.code === 'HN'
  }).length
  const unresolvedCount = rows.length - assignedCount
  const pending = rows.filter(row => row.warehouse_status === 'READY_TO_TRANSFER')
  const done = rows.filter(row =>
    ['WAREHOUSE_RECEIVED', 'WAREHOUSE_SKIPPED', 'WAREHOUSE_MIXED'].includes(String(row.warehouse_status)))
  // Preserve legacy deep-links from Kho overview; expose only three workflow states.
  const currentStatus = state === 'ready' ? 'ready' :
    state === 'pending' || state === 'incomplete' || state === 'missing' ? 'pending' :
    state === 'done' ? 'done' : 'all'

  // Fetch decisions before filtering: a line explicitly skipped without SKU
  // must count toward "ready" and must not disappear from its own tab.
  const decisionSourceRows = currentStatus==='done' ? done :
    currentStatus==='all' ? rows : pending

  // Read persistent decisions only in live mode (Preview targets the same
  // Supabase project but must remain read-only before the migration).
  // Query only relevant orders in bounded chunks for PostgREST limits.
  const decisionList:any[]=[]
  let decisionError:{message:string}|null=null
  if(isLive){
    // Supabase/PostgREST may cap individual responses below requested limits;
    // paginate every order chunk so no persisted item decision is silently lost.
    for(let offset=0;offset<decisionSourceRows.length&&!decisionError;offset+=100){
      const ids=decisionSourceRows.slice(offset,offset+100).map(o=>o.id)
      for(let itemOffset=0;itemOffset<50000;itemOffset+=500){
        const {data,error:loadError}=await supabase.from('warehouse_item_decisions')
          .select('order_item_id,order_id,product_variant_id,decision,sale_price,multiplier,skip_reason,processing_state,updated_at')
          .in('order_id',ids).order('order_item_id')
          .range(itemOffset,itemOffset+499)
        if(loadError){decisionError=loadError;break}
        const part=data??[]
        decisionList.push(...part)
        if(part.length<500)break
        if(itemOffset===49500){
          decisionError={message:'Số dòng bóc tách vượt giới hạn; vui lòng lọc hẹp hơn'}
        }
      }
    }
  }
  const itemDecisions=Object.fromEntries(decisionList.map(x=>[x.order_item_id,x]))
  const isReady=(row:any)=>{
    const items=row.order_items??[]
    if(!items.length)return false
    const records=items.map((item:any)=>itemDecisions[item.id])
    const hasDraft=records.some(Boolean)
    return items.every((item:any,index:number)=>{
      const quantity=Number(item.quantity)
      if(!Number.isInteger(quantity)||quantity<1)return false
      if(!hasDraft)return !!item.product_variant_id&&
        Number.isInteger(Number(item.inventory_multiplier??1))&&Number(item.inventory_multiplier??1)>0
      const d=records[index]
      if(!d||d.processing_state!=='DRAFT')return false
      const skipped=d.decision==='SKIP'&&!!String(d.skip_reason??'').trim()
      if(skipped&&!item.product_variant_id&&d.product_variant_id===null&&
        Number(d.sale_price)===0&&Number(d.multiplier)===1)return true
      const factor=Number(d.multiplier)
      return !!item.product_variant_id&&d.product_variant_id===item.product_variant_id&&
        Number.isInteger(factor)&&factor>0&&factor===Number(item.inventory_multiplier??1)&&
        Number.isFinite(Number(d.sale_price))&&Number(d.sale_price)>=0&&
        (d.decision==='IN'||skipped)&&quantity*factor<=2147483647
    })
  }
  const ready=pending.filter(isReady)
  const incomplete=pending.filter(row=>!isReady(row))
  const missingItems=incomplete.reduce((sum,row)=>
    sum+(row.order_items??[]).filter((item:any)=>{
      const d=itemDecisions[item.id]
      return !item.product_variant_id&&!(d?.decision==='SKIP'&&
        d?.processing_state==='DRAFT'&&d?.product_variant_id===null&&
        !!String(d.skip_reason??'').trim())
    }).length,0)
  const displayedRows=currentStatus==='pending'?incomplete:
    currentStatus==='ready'?ready:currentStatus==='done'?done:rows
  const statusHref = (status: 'all' | 'pending' | 'ready' | 'done') => {
    const query = new URLSearchParams({ state: status })
    if (receivedPeriod !== 'all') query.set('received_range', receivedPeriod)
    if (receivedPeriod === 'custom') {
      if (dateFrom) query.set('from', dateFrom)
      if (dateTo) query.set('to', dateTo)
    }
    return '/warehouse/receive?' + query.toString()
  }

  return <div className="tracking-screen tracking-screen-v2 whx-page warehouse-receive-screen">
    <header className="page-head tracking-page-head-v2">
      <div>
        <span className="module-eyebrow">VẬN HÀNH KHO</span>
        <h1>Nhập kho</h1>
        <p>Theo Kho nhận · Bóc tách SKU · Quyết định nhập hoặc bỏ qua theo từng sản phẩm</p>
      </div>
      <div className="head-actions">
        <WarehouseReceivingSettings
          warehouses={((receivingWarehouses ?? []).filter(w => w.is_active)) as any[]}
          defaultReceivingWarehouseId={settings?.default_receiving_warehouse_id ?? null}
          previewOnly={!canWrite}
        />
        <Link className="button" href="/purchase/tracking?range=all&status=DELIVERED&receive=WAITING_RECEIVE">Đơn chờ nhận</Link>
      </div>
    </header>

    {!error && unresolvedCount > 0 && <div className="tracking-flash-row">
      <div className="warehouse-intake-rule" role="status">
        <b>{unresolvedCount} đơn chưa xác định được kho nhận thực tế</b>
        <span>Vui lòng kiểm tra liên kết phiếu nhận. Hệ thống không tự suy đoán theo HUB và không nhập kho.</span>
      </div>
    </div>}
    {(error||decisionError) && <div className="tracking-flash-row">
      <div className="error-box">Không thể tải dữ liệu Kho nhận: {(error||decisionError)?.message}</div>
    </div>}

    <div className="warehouse-receive-date-toolbar">
      <PurchaseDateFilter activeRange={receivedPeriod} from={sinceDay || dateFrom || today} to={untilDay || dateTo || today}
        label="Ngày nhận hàng" basePath="/warehouse/receive" dateDescription="ngày nhận hàng"
        rangeParam="received_range" showAll preserveParams={{state:currentStatus}}/>
      {invalidDateRange && <span className="warehouse-receive-date-error" role="alert">Từ ngày không được sau Đến ngày.</span>}
    </div>
    <section className="tracking-command-center-v2 warehouse-command-center">
      <div className="tracking-status-strip-v2 wh-native-status-kpis" aria-label="Tất cả và ba trạng thái nhập kho">
        <Link href={statusHref('all')} className={'tracking-status-metric ' + (currentStatus === 'all' ? 'active' : '')}>
          <span>Tất cả</span><b>{rows.length}</b><small>{pending.length} cần xử lý · {done.length} đã xử lý</small>
        </Link>
        <Link href={statusHref('pending')} className={'tracking-status-metric warning ' + (currentStatus === 'pending' ? 'active' : '')}>
          <span>Chờ bóc tách</span><b>{incomplete.length}</b><small>{missingItems} dòng SKU chưa ghép</small>
        </Link>
        <Link href={statusHref('ready')} className={'tracking-status-metric info ' + (currentStatus === 'ready' ? 'active' : '')}>
          <span>Chờ nhập kho</span><b>{ready.length}</b><small>Đã ghép SKU, chưa ghi tồn</small>
        </Link>
        <Link href={statusHref('done')} className={'tracking-status-metric success ' + (currentStatus === 'done' ? 'active' : '')}>
          <span>Đã xử lý</span><b>{done.length}</b><small>Đã nhập kho hoặc bỏ qua kho</small>
        </Link>
      </div>
    </section>

    <WarehouseIntakeWorkspace
      rows={displayedRows}
      variants={allVariants} skuProducts={skuProducts??[]}
      auditLogs={(auditLogs ?? []) as any[]}
      suggestions={suggestions}
      itemDecisions={itemDecisions}
      simulate={!isLive}
      previewOnly={!canWrite}
      showProcessedOnly={currentStatus==='done'}
      canCorrectFinalizedSku={canCorrectFinalizedSku}
    />
  </div>
}
