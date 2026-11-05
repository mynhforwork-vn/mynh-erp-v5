'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ManagedColumnsMenu, SortableHeader, useManagedColumns, useManagedSort } from '@/components/managed-table-columns'
import { formatDateTime, formatMoney, formatPhone } from '@/lib/format'
import { processWarehouseItemsV21, saveWarehouseSkuV21 } from '@/lib/actions/warehouse-item-v21'

type Column = 'order' | 'received' | 'warehouse' | 'total' | 'mapped' | 'receivedCount' | 'skippedCount' | 'status'
const COLUMNS: Column[] = ['order','received','warehouse','total','mapped','receivedCount','skippedCount','status']
const LABELS: Record<Column,string> = {
  order:'Mã đơn',received:'Ngày nhận',warehouse:'Kho',
  total:'Sản phẩm',mapped:'Đã bóc tách',receivedCount:'Nhập kho',
  skippedCount:'Bỏ qua',status:'Trạng thái',
}

type Variant = {
  id: string
  variant_name: string
  sale_price: number | string | null
  products?: { sku?: string | null; name?: string | null } | null
}
type Item = {
  id: string; sku?: string | null; product_name: string; variant?: string | null
  quantity: number; original_price?: number | string | null; final_price?: number | string | null
  product_variant_id?: string | null; inventory_multiplier?: number | null
  warehouse_item_status?: 'PENDING' | 'RECEIVED' | 'SKIPPED' | null
  warehouse_item_skip_reason?: string | null
  product_variants?: Variant | null
}
type Batch = { warehouse_id?: string | null; received_at?: string | null; warehouses?: { id?: string; code?: string; name?: string; address?: string } | null }
type Row = {
  id: string; shopee_order_id?: string | null; order_date?: string | null
  warehouse_status?: string | null; cod?: number | string | null; prepaid_amount?: number | string | null
  recipient_name?: string | null; recipient_phone?: string | null; recipient_address?: string | null
  destination_hub?: string | null
  erp_users?: { username?: string | null } | null
  receive_batch_details?: Array<{ receive_batches?: Batch | null }> | null
  shipments?: Array<{ carrier?: string | null; tracking_number?: string | null; current_tracking_status?: string | null; is_active?: boolean }> | null
  order_vouchers?: Array<{ voucher_code?: string | null; voucher_name?: string | null; voucher_type?: string | null; voucher_tag?: string | null }> | null
  order_items: Item[]
}
type Audit = { id: number | string; entity_id?: string | null; action: string; created_at: string; old_value?: Record<string, unknown> | null; new_value?: Record<string, unknown> | null }
type Suggestion = { variant_id: string; sku?: string | null; product_name?: string | null; variant_name?: string | null; multiplier: number }
type Warehouse = { id: string; code: string; name: string; address?: string | null }
type Decision = { item_id: string; action: 'IN' | 'SKIP'; reason: string }

function batchOf(row: Row): Batch | null {
  const result = row.receive_batch_details?.[0]?.receive_batches
  return result ?? null
}
function warehouseOf(row: Row) {
  return batchOf(row)?.warehouses
}
function itemStatus(item: Item, row: Row): 'PENDING' | 'RECEIVED' | 'SKIPPED' {
  if (item.warehouse_item_status) return item.warehouse_item_status
  if (row.warehouse_status === 'WAREHOUSE_RECEIVED') return 'RECEIVED'
  if (row.warehouse_status === 'WAREHOUSE_SKIPPED') return 'SKIPPED'
  return 'PENDING'
}
function stats(row: Row) {
  const items = row.order_items ?? []
  const received = items.filter(i => itemStatus(i, row) === 'RECEIVED').length
  const skipped = items.filter(i => itemStatus(i, row) === 'SKIPPED').length
  const pending = items.length - received - skipped
  const mapped = items.filter(i => Boolean(i.product_variant_id)).length
  return { total: items.length, received, skipped, pending, mapped, missing: pending > 0 && items.some(i => itemStatus(i, row) === 'PENDING' && !i.product_variant_id) }
}
type Stage='needs'|'split'|'partial'|'ready'|'done'
function rowStage(row: Row): Exclude<Stage,'needs'> {
  const s = stats(row)
  if (s.total > 0 && s.pending === 0) return 'done'
  if (s.missing || s.total === 0) {
    return s.total === 0 || (s.mapped === 0 && s.received === 0 && s.skipped === 0)
      ? 'split' : 'partial'
  }
  return 'ready'
}
function labelForStatus(item: Item, row: Row) {
  const status = itemStatus(item, row)
  if (status === 'RECEIVED') return 'Đã nhập kho'
  if (status === 'SKIPPED') return 'Đã bỏ qua'
  return item.product_variant_id ? 'Chờ quyết định' : 'Chưa bóc tách'
}
function price(value: number | string | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Chưa có' : formatMoney(value)
}
function moneyValue(value: number | string | null | undefined) {
  return value === null || value === undefined || value === '' ? null : Number(value)
}
function sourceTotal(items: Item[], field: 'original_price' | 'final_price') {
  return items.every(item => item[field] !== null && item[field] !== undefined)
    ? items.reduce((s, i) => s + Number(i[field]) * Number(i.quantity ?? 0), 0)
    : null
}
function actionLabel(action: string) {
  const labels: Record<string, string> = {
    MAP_INVENTORY_SKU: 'Xác nhận hoặc điều chỉnh SKU',
    UPDATE_SALE_PRICE: 'Cập nhật giá bán',
    RECEIVE_INTO_STOCK: 'Xác nhận nhập kho',
    SKIP_WAREHOUSE_ITEM: 'Bỏ qua nhập kho sản phẩm',
    SKIP_WAREHOUSE: 'Bỏ qua nhập kho đơn',
  }
  return labels[action] ?? 'Thao tác kho'
}

export function WarehouseIntakeV21({
  rows, variants, warehouses, auditLogs, suggestions, schemaReady, canOperate, initialStage = 'needs',
}: {
  rows: Row[]; variants: Variant[]; warehouses: Warehouse[]; auditLogs: Audit[]
  suggestions: Record<string, Suggestion>; schemaReady: boolean; canOperate: boolean
  initialStage?: Stage
}) {
  const router = useRouter()
  const managedColumns = useManagedColumns<Column>('mynh-warehouse-v21-column-prefs',COLUMNS,['order'])
  const managedSort = useManagedSort<Column>('mynh-warehouse-v21-sort','received','desc')
  const [busy, startTransition] = useTransition()
  const [stage, setStage] = useState<Stage>(initialStage)
  const [warehouse, setWarehouse] = useState('all')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<'products' | 'info' | 'history'>('products')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [variantId, setVariantId] = useState('')
  const [newSku, setNewSku] = useState('')
  const [newName, setNewName] = useState('')
  const [newVariant, setNewVariant] = useState('')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [salePrice, setSalePrice] = useState('')
  const [multiplier, setMultiplier] = useState('1')
  const [confirmPriceUpdate, setConfirmPriceUpdate] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(id)
  }, [toast])

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; code: string; label: string; count: number }>()
    for (const row of rows) {
      const info = warehouseOf(row)
      const id = batchOf(row)?.warehouse_id ?? 'unknown'
      const entry = map.get(id) ?? { id, code: info?.code ?? '?', label: info?.address ?? info?.name ?? 'Kho chưa xác định', count: 0 }
      entry.count += 1
      map.set(id, entry)
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'))
  }, [rows])

  const visible = useMemo(() => {
    const filtered = rows.filter(row => {
    if (stage === 'needs' ? !['split','partial'].includes(rowStage(row)) : rowStage(row) !== stage) return false
    if (warehouse !== 'all' && (batchOf(row)?.warehouse_id ?? 'unknown') !== warehouse) return false
    if (!query.trim()) return true
    const hay = [
      row.shopee_order_id, row.recipient_name, row.erp_users?.username,
      ...row.order_items.flatMap(item => [item.sku, item.product_name, item.variant, item.product_variants?.products?.sku]),
    ].filter(Boolean).join(' ').toLocaleLowerCase('vi')
    return hay.includes(query.trim().toLocaleLowerCase('vi'))
    })
    const value = (row:Row,column:Column):string|number => {
      const st=stats(row)
      if(column==='order')return String(row.shopee_order_id??row.id)
      if(column==='received')return new Date(batchOf(row)?.received_at??row.order_date??0).getTime()
      if(column==='warehouse')return String(warehouseOf(row)?.code??'')
      if(column==='total')return st.total
      if(column==='mapped')return st.mapped
      if(column==='receivedCount')return st.received
      if(column==='skippedCount')return st.skipped
      return rowStage(row)
    }
    return [...filtered].sort((a,b)=>{
      const av=value(a,managedSort.key),bv=value(b,managedSort.key)
      const cmp=typeof av==='number'&&typeof bv==='number'
        ? av-bv : String(av).localeCompare(String(bv),'vi')
      return managedSort.dir==='asc' ? cmp : -cmp
    })
  },[rows,stage,warehouse,query,managedSort.key,managedSort.dir])

  const active = rows.find(row => row.id === activeId) ?? null
  const focused = active?.order_items.find(item => item.id === focusedId) ?? null
  const selectedVariant = variants.find(v => v.id === variantId) ?? null
  const changedPrice = mode === 'existing' && selectedVariant !== null
    && salePrice !== '' && Number(salePrice) !== (currentPrice ?? Number.NaN)

  function openOrder(row: Row) {
    setActiveId(row.id)
    setTab('products')
    setDecisions({})
    setFocusedId((row.order_items.find(i => itemStatus(i, row) === 'PENDING' && !i.product_variant_id)
      ?? row.order_items.find(i => itemStatus(i, row) === 'PENDING')
      ?? row.order_items[0])?.id ?? null)
  }
  function focusItem(item: Item) {
    setFocusedId(item.id)
    setMode(item.product_variant_id ? 'existing' : 'existing')
    setVariantId(item.product_variant_id ?? '')
    setMultiplier(String(item.inventory_multiplier ?? 1))
    setNewSku('')
    setNewName(item.product_name)
    setNewVariant(item.variant ?? 'Mặc định')
    const suggestion = suggestions[item.id]
    const chosen = variants.find(v => v.id === item.product_variant_id)
    const resolved = chosen ?? null
    setSalePrice(resolved?.sale_price == null ? '' : String(resolved.sale_price))
    setCurrentPrice(resolved?.sale_price == null ? null : Number(resolved.sale_price))
    setConfirmPriceUpdate(false)
    if (!item.product_variant_id && suggestion && variants.some(v => v.id === suggestion.variant_id)) {
      // Suggestion is deliberately not auto-confirmed or applied.
      setVariantId('')
    }
  }
  useEffect(() => {
    if (focused) focusItem(focused)
    // Intentionally initialize the form only when focus moves. The user can edit freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, activeId])

  function chooseVariant(id: string) {
    setVariantId(id)
    const v = variants.find(v => v.id === id)
    const p = v?.sale_price == null ? null : Number(v.sale_price)
    setCurrentPrice(p)
    setSalePrice(p === null ? '' : String(p))
    setConfirmPriceUpdate(false)
  }
  function notify(message: string, type: 'success' | 'error') { setToast({ message, type }) }
  function run<T>(handler: () => Promise<T>, success: string, after?: () => void) {
    startTransition(() => {
      void handler().then(() => {
        notify(success, 'success')
        after?.()
        router.refresh()
      }).catch((e: unknown) => notify(e instanceof Error ? e.message : 'Không thể hoàn tất thao tác', 'error'))
    })
  }
  function saveSku(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!focused || !active) return
    if (changedPrice && !confirmPriceUpdate) {
      notify('Cần xác nhận cập nhật giá bán dùng chung cho POS', 'error')
      return
    }
    if (mode === 'existing' && !variantId) {
      notify('Chưa chọn SKU có sẵn', 'error'); return
    }
    if (!Number.isInteger(Number(multiplier)) || Number(multiplier) < 1) {
      notify('Hệ số quy đổi phải là số nguyên dương', 'error'); return
    }
    const form = new FormData(e.currentTarget)
    form.set('item_id', focused.id)
    form.set('existing_variant_id', mode === 'existing' ? variantId : '')
    form.set('inventory_multiplier', multiplier)
    form.set('sale_sku', newSku)
    form.set('sale_product_name', newName)
    form.set('sale_variant_name', newVariant)
    form.set('sale_price', salePrice)
    form.set('expected_sale_price', currentPrice === null ? '' : String(currentPrice))
    form.set('update_existing_price', changedPrice && confirmPriceUpdate ? 'true' : 'false')
    run(() => saveWarehouseSkuV21(form), 'Đã xác nhận SKU', () => {
      const next = active.order_items.find(i =>
        i.id !== focused.id && itemStatus(i, active) === 'PENDING' && !i.product_variant_id)
      if (next) setFocusedId(next.id)
    })
  }
  function setDecision(item: Item, action: 'IN' | 'SKIP') {
    setDecisions(old => ({ ...old, [item.id]: {
      item_id: item.id, action,
      reason: old[item.id]?.reason ?? '',
    } }))
  }
  function confirmDecisions() {
    if (!active) return
    const list = Object.values(decisions).filter(d => active.order_items.some(item =>
      item.id === d.item_id && itemStatus(item, active) === 'PENDING' && !!item.product_variant_id))
    if (list.length === 0) { notify('Chưa chọn sản phẩm đủ SKU để xử lý kho', 'error'); return }
    if (list.some(d => d.action === 'SKIP' && !d.reason.trim())) {
      notify('Cần nhập lý do cho sản phẩm bỏ qua kho', 'error'); return
    }
    const form = new FormData()
    form.set('order_id', active.id)
    form.set('decisions', JSON.stringify(list))
    run(() => processWarehouseItemsV21(form), 'Đã xử lý ' + list.length + ' sản phẩm', () => setDecisions({}))
  }

  return <div className="wiv21 wiv21-system">
    {!schemaReady && <div className="wiv21-compat" role="status">
      Đang hiển thị bản thiết kế V2.1 ở chế độ chỉ xem. Chức năng ghi sẽ được mở sau khi migration được phê duyệt và kiểm thử.
    </div>}
    <div className="wiv21-warehouses" aria-label="Chọn kho nhận">
      <button type="button" className={warehouse === 'all' ? 'active' : ''} onClick={() => setWarehouse('all')}>Tất cả kho</button>
      {groups.map(g => <button key={g.id} type="button" className={warehouse === g.id ? 'active' : ''} onClick={() => setWarehouse(g.id)}>
        {g.code} · {g.label} <span>{g.count}</span>
      </button>)}
    </div>

    <div className="wiv21-metrics">
      {([
        ['split', 'Chờ bóc tách'],
        ['partial', 'Đang xử lý'],
        ['ready', 'Chờ quyết định kho'],
        ['done', 'Đã xử lý'],
      ] as const).map(([key, label]) => <button key={key} className={stage === key ? 'active' : ''} type="button" onClick={() => setStage(key)}>
        <span>{label}</span><strong>{rows.filter(r => rowStage(r) === key && (warehouse === 'all' || batchOf(r)?.warehouse_id === warehouse)).length}</strong>
      </button>)}
    </div>

    <div className={'whx-intake-layout warehouse-intake-layout wiv21-workspace' + (active ? ' with-panel' : '')}>
      <section className="whx-intake-main wiv21-main">
    <div className="wiv21-toolbar">
      <div><strong>{stage === 'needs' ? 'Đơn chưa ghép đủ SKU' : stage === 'split' ? 'Đơn chưa bóc tách' : stage === 'partial' ? 'Đơn đang bóc tách' : stage === 'ready' ? 'Chờ quyết định nhập kho' : 'Đã xử lý kho'}</strong>
        <small>{visible.length} đơn trong danh sách · Chọn mã đơn để mở chi tiết</small></div>
      <div className="wiv21-tools">
        <div className="wiv21-toolbar-input">
          <input aria-label="Tìm đơn hoặc sản phẩm" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tìm mã đơn, sản phẩm, SKU..." />
          <button type="button" aria-label="Xóa bộ lọc" title="Xóa bộ lọc" onClick={() => { setQuery(''); setWarehouse('all'); setStage('needs') }}>⌫</button>
        </div>
        <ManagedColumnsMenu labels={LABELS} manager={managedColumns}/>
      </div>
    </div>

    <div className="wiv21-grid-wrap">
      <table className="wiv21-table">
        <thead><tr>{managedColumns.visible.map(col =>
          <th key={col}><SortableHeader column={col} label={LABELS[col]} sort={managedSort} onSort={managedSort.toggle}/></th>
        )}</tr></thead>
        <tbody>
          {visible.length === 0 && <tr><td colSpan={managedColumns.visible.length} className="wiv21-empty">Không có đơn phù hợp bộ lọc.</td></tr>}
          {visible.map(row => {
            const st=stats(row)
            return <tr key={row.id}>{managedColumns.visible.map(col=>{
              if(col==='order')return <td key={col}><button type="button" className="wiv21-order-link" onClick={()=>openOrder(row)}>{row.shopee_order_id??row.id.slice(0,8)}</button></td>
              if(col==='received')return <td key={col}>{formatDateTime(batchOf(row)?.received_at??row.order_date)}</td>
              if(col==='warehouse')return <td key={col}>{warehouseOf(row)?.code??'—'}</td>
              if(col==='total')return <td key={col}>{st.total} dòng</td>
              if(col==='mapped')return <td key={col}>{st.mapped}/{st.total}</td>
              if(col==='receivedCount')return <td key={col}>{st.received}</td>
              if(col==='skippedCount')return <td key={col}>{st.skipped}</td>
              return <td key={col}><span className={'wiv21-status '+rowStage(row)}>{rowStage(row)==='split'?'Chưa bóc tách':rowStage(row)==='partial'?'Đang xử lý':rowStage(row)==='ready'?'Chờ xử lý kho':'Đã hoàn tất'}</span></td>
            })}</tr>
          })}
        </tbody>
      </table>
    </div>
      </section>
    {active && <aside className="whx-detail-panel mynh-slide-panel wiv21-panel" data-system-slidebar="true" aria-label="Chi tiết xử lý kho">
        <div className="whx-panel-head wiv21-panel-head">
          <div><small>CHI TIẾT ĐƠN / {warehouseOf(active)?.code ?? 'KHO NHẬN'}</small>
            <h2>{active.shopee_order_id ?? active.id.slice(0, 8)}</h2>
            <p>{warehouseOf(active)?.address ?? warehouseOf(active)?.name ?? 'Chưa xác định kho'} · {formatDateTime(batchOf(active)?.received_at)}</p></div>
          <button className="close" type="button" aria-label="Đóng chi tiết" onClick={() => setActiveId(null)}>×</button>
        </div>
        <div className="whx-panel-tabs wiv21-panel-tabs">
          <button type="button" className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Sản phẩm</button>
          <button type="button" className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>Thông tin đơn</button>
          <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Lịch sử</button>
        </div>
        <div className="whx-panel-scroll wiv21-panel-body">
          {tab === 'products' && <>
            <div className="wiv21-progress">
              <strong>Xử lý từng sản phẩm</strong>
              <span>{stats(active).received} nhập · {stats(active).skipped} bỏ qua · {stats(active).pending} còn lại</span>
            </div>
            <div className="wiv21-item-select">
              {active.order_items.map((item, i) =>
                <button type="button" key={item.id} className={focusedId === item.id ? 'active' : ''}
                  onClick={() => focusItem(item)}>
                  <b>{i + 1}. {item.product_name}</b>
                  <small>{labelForStatus(item, active)} · SL {item.quantity}</small>
                </button>)}
            </div>
            {focused && <div className="wiv21-editor" key={focused.id}>
              <div className="wiv21-section-title"><strong>{focused.product_name}</strong><span>{labelForStatus(focused, active)}</span></div>
              <div className="wiv21-source-grid">
                <div><small>SKU mua / Phân loại</small><b>{focused.sku || 'Chưa có SKU'} · {focused.variant || 'Mặc định'}</b></div>
                <div><small>Số lượng mua</small><b>{focused.quantity}</b></div>
                <div><small>Giá gốc</small><b>{price(focused.original_price)}</b></div>
                <div><small>Giá sau giảm</small><b>{price(focused.final_price)}</b></div>
              </div>
              {itemStatus(focused, active) !== 'PENDING' ? <div className="wiv21-readonly">
                Sản phẩm đã xử lý kho. Mapping và số lượng chỉ được xem; muốn điều chỉnh tồn cần nghiệp vụ riêng.
                {focused.warehouse_item_skip_reason && <p>Lý do: {focused.warehouse_item_skip_reason}</p>}
              </div> : <>
                <form onSubmit={saveSku} className="wiv21-sku-form">
                  <div className="wiv21-section-title"><strong>Bóc tách SKU bán</strong></div>
                  <div className="wiv21-inline-toggle">
                    <button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => { setMode('existing'); setConfirmPriceUpdate(false) }}>SKU có sẵn</button>
                    <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => { setMode('new'); setVariantId(''); setCurrentPrice(null); setSalePrice(''); setConfirmPriceUpdate(false) }}>Tạo SKU mới</button>
                  </div>
                  {mode === 'existing' ? <>
                    <label>Chọn SKU bán
                      <select value={variantId} onChange={e => chooseVariant(e.target.value)} disabled={!schemaReady || !canOperate || busy}>
                        <option value="">— Chọn SKU bán —</option>
                        {variants.map(v => <option key={v.id} value={v.id}>{v.products?.sku ?? '?'} · {v.products?.name ?? ''} · {v.variant_name}</option>)}
                      </select>
                    </label>
                    {suggestions[focused.id] && !focused.product_variant_id && <div className="wiv21-hint">
                      Gợi ý từ lần trước: {suggestions[focused.id].sku} · {suggestions[focused.id].product_name}. Cần tự chọn và xác nhận.
                    </div>}
                    <div className="wiv21-price-strip"><span>Giá bán hiện tại</span><b>{price(currentPrice)}</b></div>
                  </> : <div className="wiv21-form-cols">
                    <label>SKU mới<input value={newSku} onChange={e => setNewSku(e.target.value)} placeholder="Nhập mã SKU" required /></label>
                    <label>Tên sản phẩm<input value={newName} onChange={e => setNewName(e.target.value)} required /></label>
                    <label>Phân loại<input value={newVariant} onChange={e => setNewVariant(e.target.value)} /></label>
                  </div>}
                  <div className="wiv21-form-cols">
                    <label>Giá bán {mode === 'existing' ? 'được phép điều chỉnh' : 'mới'}
                      <input inputMode="decimal" type="number" min="0" step="1" value={salePrice} onChange={e => { setSalePrice(e.target.value); setConfirmPriceUpdate(false) }} required={mode === 'new'} />
                    </label>
                    <label>1 SP mua = số đơn vị tồn
                      <input type="number" min="1" step="1" value={multiplier} onChange={e => setMultiplier(e.target.value)} required />
                    </label>
                  </div>
                  <div className="wiv21-price-strip">
                    <span>Số lượng nhập nếu chọn Nhập kho</span>
                    <b>{Number.isInteger(Number(multiplier)) && Number(multiplier)>0 ? Number(multiplier) * Number(focused.quantity) : '—'}</b>
                  </div>
                  {changedPrice && <label className="wiv21-price-confirm">
                    <input type="checkbox" checked={confirmPriceUpdate} onChange={e => setConfirmPriceUpdate(e.target.checked)} />
                    <span>Xác nhận đổi giá SKU từ {price(currentPrice)} thành {price(salePrice)}. POS sẽ dùng giá mới; hóa đơn cũ không thay đổi.</span>
                  </label>}
                  <button type="submit" className="wiv21-primary" disabled={!schemaReady || !canOperate || busy || (mode === 'existing' && !variantId)}>
                    {busy ? 'Đang lưu...' : 'Lưu SKU & tiếp tục'}
                  </button>
                </form>
                {focused.product_variant_id && <div className="wiv21-decision">
                  <strong>Quyết định xử lý kho</strong><p>Chỉ lựa chọn tại đây chưa làm tăng tồn. Xác nhận chung bên dưới mới ghi dữ liệu.</p>
                  <div className="wiv21-inline-toggle">
                    <button type="button" className={decisions[focused.id]?.action === 'IN' ? 'active' : ''} disabled={!schemaReady || !canOperate || busy} onClick={() => setDecision(focused, 'IN')}>Nhập kho sản phẩm</button>
                    <button type="button" className={decisions[focused.id]?.action === 'SKIP' ? 'active' : ''} disabled={!schemaReady || !canOperate || busy} onClick={() => setDecision(focused, 'SKIP')}>Bỏ qua sản phẩm</button>
                  </div>
                  {decisions[focused.id]?.action === 'SKIP' && <label>Lý do bỏ qua
                    <textarea value={decisions[focused.id]?.reason ?? ''} maxLength={500} onChange={e => setDecisions(current => ({
                      ...current, [focused.id]: { ...current[focused.id], reason: e.target.value },
                    }))} placeholder="Nhập lý do bắt buộc" /></label>}
                </div>}
              </>}
            </div>}
            {Object.keys(decisions).length > 0 && <div className="wiv21-confirm-summary">
              <strong>Chờ xác nhận: {Object.values(decisions).filter(x => x.action === 'IN').length} nhập kho · {Object.values(decisions).filter(x => x.action === 'SKIP').length} bỏ qua</strong>
              <p>Chỉ các dòng chọn Nhập kho được ghi tăng tồn tại kho nhận thực tế.</p>
              <button className="wiv21-primary" type="button" disabled={!schemaReady || !canOperate || busy} onClick={confirmDecisions}>{busy ? 'Đang xử lý...' : 'Xác nhận các sản phẩm đã chọn'}</button>
              <button className="wiv21-link" type="button" onClick={() => setDecisions({})}>Hủy lựa chọn</button>
            </div>}
          </>}
          {tab === 'info' && <>
            <div className="wiv21-info-head"><strong>Thông tin đơn hàng</strong><span>Đối chiếu trực tiếp khi xác định giá bán</span></div>
            <div className="wiv21-source-grid">
              <div><small>Mã đơn</small><b>{active.shopee_order_id ?? '—'}</b></div>
              <div><small>Tài khoản mua</small><b>{active.erp_users?.username ?? 'Chưa có'}</b></div>
              <div><small>Ngày đặt hàng</small><b>{formatDateTime(active.order_date)}</b></div>
              <div><small>Ngày nhận</small><b>{formatDateTime(batchOf(active)?.received_at)}</b></div>
              <div><small>Kho nhận thực tế</small><b>{warehouseOf(active)?.code ?? 'Chưa xác định'} · {warehouseOf(active)?.address ?? ''}</b></div>
              <div><small>Tiến độ xử lý</small><b>{stats(active).received} nhập · {stats(active).skipped} bỏ · {stats(active).pending} còn</b></div>
            </div>
            <div className="wiv21-info-head"><strong>Giá trị đơn</strong><span>Giá nguồn được giữ nguyên, không ước đoán</span></div>
            <div className="wiv21-source-grid">
              <div><small>Tổng giá gốc</small><b>{price(sourceTotal(active.order_items, 'original_price'))}</b></div>
              <div><small>Tổng giá sau giảm</small><b>{price(sourceTotal(active.order_items, 'final_price'))}</b></div>
              <div><small>COD</small><b>{price(active.cod)}</b></div>
              <div><small>Trả trước</small><b>{price(active.prepaid_amount)}</b></div>
            </div>
            <div className="wiv21-info-head"><strong>Người nhận & vận chuyển</strong></div>
            <div className="wiv21-source-grid">
              <div><small>Người nhận</small><b>{active.recipient_name ?? 'Chưa có'}</b></div>
              <div><small>Số điện thoại</small><b>{formatPhone(active.recipient_phone)}</b></div>
              <div className="wide"><small>Địa chỉ</small><b>{active.recipient_address ?? 'Chưa có'}</b></div>
              <div><small>HUB đích</small><b>{active.destination_hub ?? 'Chưa có'}</b></div>
              <div><small>Đơn vị / mã vận đơn</small><b>{active.shipments?.find(x => x.is_active)?.carrier ?? active.shipments?.[0]?.carrier ?? 'Chưa có'} · {active.shipments?.find(x => x.is_active)?.tracking_number ?? active.shipments?.[0]?.tracking_number ?? 'Chưa có'}</b></div>
            </div>
            <div className="wiv21-info-head"><strong>Voucher</strong></div>
            <div className="wiv21-vouchers">{!active.order_vouchers?.length ? 'Chưa có voucher' : active.order_vouchers.map((v, i) =>
              <div key={i}>{v.voucher_code || v.voucher_name || 'Voucher'} · {v.voucher_type || 'Chưa phân loại'} · {v.voucher_tag || 'Chưa có tag'}</div>)}</div>
            <div className="wiv21-info-head"><strong>Sản phẩm trong đơn</strong></div>
            <div className="wiv21-item-info-list">{active.order_items.map(item =>
              <button type="button" key={item.id} onClick={() => { setTab('products'); focusItem(item) }}>
                <b>{item.product_name} · SL {item.quantity}</b>
                <small>Giá gốc {price(item.original_price)} · Sau giảm {price(item.final_price)}</small>
                <small>{item.product_variants?.products?.sku ?? 'Chưa ghép SKU bán'} · {labelForStatus(item, active)}</small>
              </button>)}</div>
          </>}
          {tab === 'history' && <div className="wiv21-history">
            {auditLogs.filter(log => String(log.entity_id) === active.id).length === 0
              ? <div>Chưa có lịch sử thao tác kho cho đơn.</div>
              : auditLogs.filter(log => String(log.entity_id) === active.id).map(log =>
                <div key={log.id}><strong>{actionLabel(log.action)}</strong><span>{formatDateTime(log.created_at)}</span>
                  {log.new_value?.order_item_id ? <small>Dòng sản phẩm: {String(log.new_value.order_item_id).slice(0, 8)}</small> : null}
                  {log.action === 'UPDATE_SALE_PRICE' && <small>Giá cũ: {price(log.old_value?.sale_price as number | null)} → Giá mới: {price(log.new_value?.sale_price as number | null)}</small>}
                  {log.new_value?.reason ? <small>Lý do: {String(log.new_value.reason)}</small> : null}
                </div>)}
          </div>}
        </div>
      </aside>}
    </div>
    {toast && <div className={'wiv21-toast ' + toast.type} role="status"><span>{toast.message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</button></div>}
  </div>
}
