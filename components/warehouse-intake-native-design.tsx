'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime, formatMoney, formatPhone, statusLabel } from '@/lib/format'
import { ManagedColumnsMenu, SortableHeader, useManagedColumns, useManagedSort } from '@/components/managed-table-columns'

type Variant = {
  id: string; variant_name: string; sale_price?: number | string | null
  products?: { sku?: string | null; name?: string | null } | null
}
type Item = {
  id: string; sku?: string | null; product_name: string; variant?: string | null; quantity: number
  original_price?: number | string | null; final_price?: number | string | null
  product_variant_id?: string | null; inventory_multiplier?: number | null
  product_variants?: Variant | null
}
type ReceiptBatch = {
  warehouse_id?: string | null; received_at?: string | null
  warehouses?: { id?: string | null; code?: string | null; name?: string | null; address?: string | null } | null
}
type Order = {
  id: string; shopee_order_id?: string | null; order_date?: string | null
  warehouse_status?: string | null; cod?: number | string | null; prepaid_amount?: number | string | null
  prepaid_source_label?: string | null; recipient_name?: string | null
  recipient_phone?: string | null; recipient_address?: string | null
  area?: string | null; destination_hub?: string | null
  order_status?: string | null; payment_status?: string | null
  erp_users?: { username?: string | null } | null
  shipments?: Array<{ carrier?: string | null; tracking_number?: string | null; current_tracking_status?: string | null; is_active?: boolean }> | null
  order_vouchers?: Array<{ voucher_code?: string | null; voucher_name?: string | null; voucher_type?: string | null; voucher_tag?: string | null }> | null
  receive_batch_details?: Array<{ receive_batches?: ReceiptBatch | null }> | null
  order_items: Item[]
}
type Audit = {
  id: number | string; entity_id?: string | null; action: string; created_at: string
  old_value?: Record<string, unknown> | null; new_value?: Record<string, unknown> | null
}
type Column = 'order' | 'received' | 'warehouse' | 'product' | 'progress' | 'cod' | 'status'
const COLUMNS: Column[] = ['order', 'received', 'warehouse', 'product', 'progress', 'cod', 'status']
const LABELS: Record<Column, string> = {
  order: 'Mã đơn', received: 'Ngày nhận', warehouse: 'Kho nhận',
  product: 'Sản phẩm', progress: 'Bóc tách', cod: 'COD', status: 'Trạng thái',
}
type Phase = 'all' | 'pending' | 'ready' | 'done'
type PreviewDecision = 'IN' | 'SKIP'
type PreviewChoice = { action: PreviewDecision; sku: string; price: string; reason?: string }

function batchOf(row: Order) {
  const details = row.receive_batch_details
  const raw = Array.isArray(details) ? details[0]?.receive_batches : null
  return Array.isArray(raw) ? raw[0] ?? null : raw ?? null
}
function hasItems(row: Order) {
  return (row.order_items?.length ?? 0) > 0
}
function isMapped(item: Item) { return Boolean(item.product_variant_id) }
function phaseOf(row: Order): Exclude<Phase, 'all'> {
  if (['WAREHOUSE_RECEIVED', 'WAREHOUSE_SKIPPED', 'WAREHOUSE_MIXED'].includes(String(row.warehouse_status)))
    return 'done'
  return hasItems(row) && row.order_items.every(isMapped) ? 'ready' : 'pending'
}
function phaseLabel(row: Order) {
  if (row.warehouse_status === 'WAREHOUSE_RECEIVED') return 'Đã nhập kho'
  if (row.warehouse_status === 'WAREHOUSE_SKIPPED') return 'Đã bỏ qua kho'
  if (row.warehouse_status === 'WAREHOUSE_MIXED') return 'Đã xử lý hỗn hợp'
  return phaseOf(row) === 'ready' ? 'Chờ quyết định kho' : 'Chờ bóc tách'
}
function receivedAt(row: Order) { return batchOf(row)?.received_at ?? row.order_date ?? null }
function valueOrMissing(value?: number | string | null) {
  return value === null || value === undefined || value === '' ? 'Chưa có' : formatMoney(value)
}
function totalSource(items: Item[], key: 'original_price' | 'final_price') {
  if (!items.length || items.some(item => item[key] === null || item[key] === undefined)) return null
  return items.reduce((total, item) => total + Number(item[key]) * Number(item.quantity), 0)
}
function warehouseCode(row: Order): 'BG' | 'HN' | null {
  const code = String(batchOf(row)?.warehouses?.code ?? '').toUpperCase().trim()
  return code === 'BG' || code === 'HN' ? code : null
}
function warehouseName(row: Order) {
  const code = warehouseCode(row)
  return code ? 'KHO ' + code : 'Chưa xác định kho nhận'
}
function productDescription(item: Item) {
  return [item.product_name, item.variant ? 'Phân loại: ' + item.variant : null, 'SL: ' + item.quantity]
    .filter(Boolean).join(' · ')
}
function actionLabel(action: string) {
  if (action === 'MAP_INVENTORY_SKU') return 'Bóc tách SKU'
  if (action === 'RECEIVE_INTO_STOCK') return 'Nhập kho'
  if (action === 'SKIP_WAREHOUSE') return 'Bỏ qua kho'
  return 'Thao tác kho'
}

export function WarehouseIntakeNativeDesign({
  rows, variants, auditLogs, initialPhase = 'all',
}: {
  rows: Order[]; variants: Variant[]; auditLogs: Audit[]; initialPhase?: Phase
}) {
  const [warehouse, setWarehouse] = useState('all')
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<'products' | 'info' | 'history'>('products')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [variantId, setVariantId] = useState('')
  const [salePrice, setSalePrice] = useState('')
  const [newSku, setNewSku] = useState('')
  const [newName, setNewName] = useState('')
  const [multiplier, setMultiplier] = useState('1')
  const [action, setAction] = useState<PreviewDecision>('IN')
  const [reason, setReason] = useState('')
  const [previewChoices, setPreviewChoices] = useState<Record<string, PreviewChoice>>({})
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const [tableMode, setTableMode] = useState<'wide' | 'compact' | 'narrow'>('wide')

  // Measure the actual list width, not the viewport. The slidebar, sidebar,
  // browser zoom and Tablet split-view all change available table space.
  useEffect(() => {
    const node = listRef.current
    const workspace = workspaceRef.current
    if (!node || !workspace) return
    const adapt = () => {
      // Measure the content area's actual width, after all surrounding panels
      // and sidebar changes. Never infer it from window.innerWidth.
      const width = Math.min(node.getBoundingClientRect().width, node.clientWidth)
      const next = width < 570 ? 'narrow' : width < 950 ? 'compact' : 'wide'
      setTableMode(current => current === next ? current : next)
    }
    adapt()
    const observer = typeof ResizeObserver === 'undefined' ? null
      : new ResizeObserver(adapt)
    observer?.observe(node)
    observer?.observe(workspace)
    // A second embedded slidebar can be added/removed without a viewport
    // resize. Observe those DOM changes and re-measure in the next layout.
    const mutation = typeof MutationObserver === 'undefined' ? null
      : new MutationObserver(adapt)
    mutation?.observe(workspace, { childList: true })
    window.addEventListener('resize', adapt)
    return () => {
      observer?.disconnect()
      mutation?.disconnect()
      window.removeEventListener('resize', adapt)
    }
  }, [])

  const columns = useManagedColumns<Column>('mynh-warehouse-native-columns', COLUMNS, ['order'])
  const sort = useManagedSort<Column>('mynh-warehouse-native-sort', 'received', 'desc')
  const warehouseLanes = useMemo(() => {
    const counts = { BG: 0, HN: 0, unknown: 0 }
    for (const row of rows) {
      const code = warehouseCode(row)
      if (code === 'BG') counts.BG++
      else if (code === 'HN') counts.HN++
      else counts.unknown++
    }
    return counts
  }, [rows])

  const visible = useMemo(() => {
    const filtered = rows.filter(row => {
      if (warehouse !== 'all' && (warehouseCode(row) ?? 'unknown') !== warehouse) return false
      if (phase !== 'all' && phaseOf(row) !== phase) return false
      if (search.trim()) {
        const text = [
          row.shopee_order_id, row.erp_users?.username, row.recipient_name,
          ...row.order_items.flatMap(item => [item.sku, item.product_name, item.variant, item.product_variants?.products?.sku]),
        ].filter(Boolean).join(' ').toLocaleLowerCase('vi')
        if (!text.includes(search.trim().toLocaleLowerCase('vi'))) return false
      }
      return true
    })
    const keyOf = (row: Order): string | number => {
      const b = batchOf(row)
      if (sort.key === 'order') return row.shopee_order_id ?? row.id
      if (sort.key === 'received') return new Date(receivedAt(row) ?? 0).getTime()
      if (sort.key === 'warehouse') return warehouseName(row)
      if (sort.key === 'product') return row.order_items[0]?.product_name ?? ''
      if (sort.key === 'progress') return row.order_items.filter(isMapped).length
      if (sort.key === 'cod') return Number(row.cod ?? 0)
      return phaseOf(row)
    }
    return [...filtered].sort((a, b) => {
      // In "Tất cả", BG and HN remain separate operational lanes.
      // Sorting applies within a confirmed receiving warehouse.
      if (warehouse === 'all') {
        const rank = (row: Order) => warehouseCode(row) === 'BG' ? 0 : warehouseCode(row) === 'HN' ? 1 : 2
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
      }
      const x = keyOf(a), y = keyOf(b)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi')
      return sort.dir === 'asc' ? order : -order
    })
  }, [rows, warehouse, phase, search, sort.key, sort.dir])

  const active = rows.find(row => row.id === activeId) ?? null
  const focused = active?.order_items.find(item => item.id === focusedId) ?? null
  const selectedVariant = variants.find(variant => variant.id === variantId) ?? null
  const logs = active ? auditLogs.filter(log => String(log.entity_id) === active.id) : []
  const activeShipment = active?.shipments?.find(s => s.is_active) ?? active?.shipments?.[0] ?? null

  function focus(item: Item) {
    setFocusedId(item.id)
    setMode('existing')
    setVariantId(item.product_variant_id ?? '')
    setSalePrice(item.product_variants?.sale_price == null ? '' : String(item.product_variants.sale_price))
    setNewSku(''); setNewName(item.product_name)
    setMultiplier(String(item.inventory_multiplier ?? 1))
    setAction('IN'); setReason(''); setNotice('')
  }
  function openOrder(row: Order) {
    setActiveId(row.id); setPanelTab('products'); setPreviewChoices({}); setNotice('')
    const first = row.order_items.find(item => !isMapped(item)) ?? row.order_items[0]
    if (first) focus(first)
    else setFocusedId(null)
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveId(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  function chooseVariant(id: string) {
    setVariantId(id)
    const found = variants.find(variant => variant.id === id)
    setSalePrice(found?.sale_price == null ? '' : String(found.sale_price))
  }
  function previewOnly() {
    if (!focused) return
    if (mode === 'existing' && !variantId) {
      setNotice('Chọn SKU bán để xem luồng xử lý dự kiến.'); return
    }
    if (mode === 'new' && !newSku.trim()) {
      setNotice('Nhập mã SKU bán mới để xem luồng xử lý dự kiến.'); return
    }
    if (!Number.isInteger(Number(multiplier)) || Number(multiplier) < 1) {
      setNotice('Hệ số quy đổi phải là số nguyên dương.'); return
    }
    if (action === 'SKIP' && !reason.trim()) {
      setNotice('Cần nhập lý do bỏ qua kho.'); return
    }
    const sku = mode === 'existing' ? selectedVariant?.products?.sku ?? '' : newSku
    setPreviewChoices(previous => ({
      ...previous, [focused.id]: { action, sku, price: salePrice, reason },
    }))
    setNotice('Đã ghi nhận lựa chọn mô phỏng trên màn hình. Không lưu SKU, giá hoặc tồn kho vào Supabase.')
  }

  const visibleColumn = (name: Column) => columns.visible.includes(name)
  const columnWeights: Record<Column, number> = {
    order: 16, received: 16, warehouse: 11, product: 29, progress: 8, cod: 9, status: 11,
  }
  const totalColumnWeight = columns.visible.reduce((sum, key) => sum + columnWeights[key], 0)
  const isGrouped = tableMode !== 'wide'
  const narrow = tableMode === 'narrow'
  const displayColumnWidths = narrow ? [41, 59] : [24, 37, 19, 20]

  const orderCell = (row: Order) => <div className="wh-native-cell-stack">
    <button type="button" className="table-link wh-native-order-link" title={row.shopee_order_id ?? row.id}
      onClick={() => openOrder(row)}>{row.shopee_order_id ?? row.id.slice(0, 8)}</button>
    {visibleColumn('received') && <span className="wh-native-cell-note">{formatDateTime(receivedAt(row))}</span>}
    {visibleColumn('warehouse') && <span className="wh-native-cell-note">Kho: {warehouseName(row)}</span>}
  </div>
  const productLines = (row: Order) => <div className="wh-native-product-lines">
    {row.order_items.length === 0
      ? <span className="wh-native-product-line">Chưa có sản phẩm</span>
      : row.order_items.map(item => <span key={item.id} className="wh-native-product-line"
          title={productDescription(item)}>{productDescription(item)}</span>)}
  </div>
  const productCell = (row: Order) => <div className="wh-native-cell-stack wh-native-grouped-product">
    {visibleColumn('product') && productLines(row)}
    {narrow && visibleColumn('progress') && <span className="wh-native-cell-note">SKU: {row.order_items.filter(isMapped).length}/{row.order_items.length}</span>}
    {narrow && visibleColumn('cod') && <span className="wh-native-cell-note">COD: {valueOrMissing(row.cod)}</span>}
    {narrow && visibleColumn('status') && <span className={'status-pill ' + (phaseOf(row) === 'done' ? 'green' : phaseOf(row) === 'ready' ? 'blue' : 'orange')}>{phaseLabel(row)}</span>}
  </div>
  const renderGroupedCells = (row: Order) => narrow
    ? <>
      <td className="wh-native-group-order">{orderCell(row)}</td>
      <td className="wh-native-group-product">{productCell(row)}</td>
    </>
    : <>
      <td className="wh-native-group-order">{orderCell(row)}</td>
      <td className="wh-native-group-product">{productCell(row)}</td>
      <td className="wh-native-group-metrics"><div className="wh-native-cell-stack">
        {visibleColumn('progress') && <span>SKU: <b>{row.order_items.filter(isMapped).length}/{row.order_items.length}</b></span>}
        {visibleColumn('cod') && <span className="wh-native-cell-note">COD: {valueOrMissing(row.cod)}</span>}
      </div></td>
      <td className="wh-native-group-status">
        {visibleColumn('status') && <span className={'status-pill ' + (phaseOf(row) === 'done' ? 'green' : phaseOf(row) === 'ready' ? 'blue' : 'orange')}>{phaseLabel(row)}</span>}
      </td>
    </>

  const renderCell = (row: Order, column: Column) => {
    if (column === 'order') return <td key={column}>
      <button type="button" className="table-link wh-native-order-link" title={row.shopee_order_id ?? row.id}
        onClick={() => openOrder(row)}>{row.shopee_order_id ?? row.id.slice(0, 8)}</button>
    </td>
    if (column === 'received') return <td key={column}>{formatDateTime(receivedAt(row))}</td>
    if (column === 'warehouse') return <td key={column}>{warehouseName(row)}</td>
    if (column === 'product') return <td key={column} className="wh-native-product-cell">{productLines(row)}</td>
    if (column === 'progress') return <td key={column}>{row.order_items.filter(isMapped).length}/{row.order_items.length}</td>
    if (column === 'cod') return <td key={column} className="money">{valueOrMissing(row.cod)}</td>
    return <td key={column}><span className={'status-pill ' + (phaseOf(row) === 'done' ? 'green' : phaseOf(row) === 'ready' ? 'blue' : 'orange')}>{phaseLabel(row)}</span></td>
  }

  return <div className="wh-native">
    <div className="wh-native-filters">
      <div className="wh-native-warehouse-tabs" aria-label="Tự phân luồng theo kho đã nhận">
        <button type="button" className={warehouse === 'all' ? 'active' : ''} onClick={() => setWarehouse('all')}>
          Tất cả <b>{rows.length}</b>
        </button>
        <button type="button" className={warehouse === 'BG' ? 'active' : ''} onClick={() => setWarehouse('BG')}>
          KHO BG <b>{warehouseLanes.BG}</b>
        </button>
        <button type="button" className={warehouse === 'HN' ? 'active' : ''} onClick={() => setWarehouse('HN')}>
          KHO HN <b>{warehouseLanes.HN}</b>
        </button>
        {warehouseLanes.unknown > 0 && <button type="button" className={warehouse === 'unknown' ? 'active' : ''}
          onClick={() => setWarehouse('unknown')}>Chưa rõ kho <b>{warehouseLanes.unknown}</b></button>}
      </div>
      <div className="wh-native-phase-tabs" aria-label="Trạng thái xử lý">
        {([
          ['all', 'Tất cả'],
          ['pending', 'Chờ bóc tách'],
          ['ready', 'Chờ quyết định kho'],
          ['done', 'Đã xử lý'],
        ] as const).map(([id, label]) => <button type="button" key={id} className={phase === id ? 'active' : ''}
          onClick={() => setPhase(id)}>{label}</button>)}
      </div>
    </div>
    <div ref={workspaceRef} className={'whx-intake-layout warehouse-intake-layout wh-native-workspace' + (active ? ' with-panel' : '')}>
      <section ref={listRef} className="whx-intake-main wh-native-list">
        <div className="managed-table-toolbar wh-native-table-toolbar">
          <span className="managed-table-meta"><b>{visible.length} đơn</b> · Dữ liệu thực từ Kho nhận, không có đơn mẫu</span>
          <div className="wh-native-search">
            <input aria-label="Tìm mã đơn, SKU, sản phẩm" placeholder="Tìm mã đơn, SKU, sản phẩm..."
              value={search} onChange={e => setSearch(e.target.value)}/>
            <button type="button" aria-label="Xóa bộ lọc" title="Xóa bộ lọc"
              onClick={() => { setSearch(''); setWarehouse('all'); setPhase('all') }}>×</button>
          </div>
          <ManagedColumnsMenu labels={LABELS} manager={columns}/>
        </div>
        <div className="tracking-hub-table-wrap tracking-hub-table-wrap-v2 wh-native-table-wrap">
          <table className={'table tracking-hub-table tracking-hub-table-v2 wh-native-table wh-native-table-' + tableMode}
            aria-label="Danh sách đơn hàng chờ xử lý kho">
            <colgroup>
              {isGrouped
                ? displayColumnWidths.map((width, index) => <col key={index} style={{ width: width + '%' }}/>)
                : columns.visible.map(key => <col key={key} style={{ width: (100 * columnWeights[key] / totalColumnWeight) + '%' }}/>)}
            </colgroup>
            <thead><tr>
              {isGrouped
                ? (narrow
                  ? <><th>Đơn hàng / Nhận</th><th>Sản phẩm / Xử lý</th></>
                  : <><th>Đơn hàng / Nhận</th><th>Sản phẩm</th><th>Bóc tách / COD</th><th>Trạng thái</th></>)
                : columns.visible.map(column =>
                  <th key={column}><SortableHeader column={column} label={LABELS[column]} sort={sort} onSort={sort.toggle}/></th>)}
            </tr></thead>
            <tbody>
              {visible.length === 0
                ? <tr><td className="empty compact" colSpan={isGrouped ? (narrow ? 2 : 4) : columns.visible.length}>Không có đơn phù hợp.</td></tr>
                : visible.flatMap((row, index) => {
                  const current = warehouseCode(row) ?? 'unknown'
                  const previous = index > 0 ? (warehouseCode(visible[index - 1]) ?? 'unknown') : null
                  const showLane = warehouse === 'all' && current !== previous
                  const count = showLane ? visible.filter(item => (warehouseCode(item) ?? 'unknown') === current).length : 0
                  return [
                    ...(showLane ? [<tr key={'lane-' + current} className="wh-native-warehouse-separator">
                      <td colSpan={isGrouped ? (narrow ? 2 : 4) : columns.visible.length}>
                        {current === 'unknown' ? 'CHƯA XÁC ĐỊNH KHO NHẬN' : 'KHO ' + current}
                        <span>{count} đơn</span>
                      </td>
                    </tr>] : []),
                    <tr key={row.id} className={'wh-native-data-row ' + (activeId === row.id ? 'active-row' : '')}>
                      {isGrouped ? renderGroupedCells(row) : columns.visible.map(column => renderCell(row, column))}
                    </tr>,
                  ]
                })}
            </tbody>
          </table>
        </div>
      </section>

      {active && <aside className="whx-detail-panel warehouse-intake-panel mynh-slide-panel wh-native-panel" data-system-slidebar="true">
        <div className="whx-panel-head">
          <div>
            <span className="module-eyebrow">CHI TIẾT BÓC TÁCH · {warehouseName(active)}</span>
            <h2>{active.shopee_order_id ?? active.id.slice(0, 8)}</h2>
            <p>{formatDateTime(receivedAt(active))} · {active.order_items.length} dòng SP · {phaseLabel(active)}</p>
          </div>
          <button type="button" className="close" aria-label="Đóng slidebar" onClick={() => setActiveId(null)}>×</button>
        </div>
        <div className="whx-panel-tabs">
          <button type="button" className={panelTab === 'products' ? 'active' : ''} onClick={() => setPanelTab('products')}>Sản phẩm</button>
          <button type="button" className={panelTab === 'info' ? 'active' : ''} onClick={() => setPanelTab('info')}>Thông tin đơn</button>
          <button type="button" className={panelTab === 'history' ? 'active' : ''} onClick={() => setPanelTab('history')}>Lịch sử</button>
        </div>
        <div className="whx-panel-scroll">
          {panelTab === 'products' && <div className="wh-native-panel-content">
            <div className="wh-native-progress"><b>{active.order_items.filter(isMapped).length}/{active.order_items.length} đã ghép SKU</b>
              <span>{Object.keys(previewChoices).length} lựa chọn thử · chưa lưu</span></div>
            <div className="wh-native-item-list">
              {active.order_items.map((item, index) => <button key={item.id} type="button" className={focusedId === item.id ? 'active' : ''}
                onClick={() => focus(item)}>
                <span><span className="wh-native-item-name">{index + 1}. {item.product_name}</span><small>{item.sku || 'Chưa có SKU mua'} · SL {item.quantity}</small></span>
                <span className="wh-native-item-status">{previewChoices[item.id] ? (previewChoices[item.id].action === 'IN' ? 'Dự kiến nhập' : 'Dự kiến bỏ') : isMapped(item) ? 'Đã ghép SKU' : 'Chưa bóc tách'}</span>
              </button>)}
            </div>
            {focused && <div className="wh-native-editor" key={focused.id}>
              <div className="panel-section-head"><h3>Đối chiếu giá mua</h3></div>
              <div className="wh-native-price-row">
                <div><span>Giá gốc / SP</span><b>{valueOrMissing(focused.original_price)}</b></div>
                <div><span>Sau giảm / SP</span><b>{valueOrMissing(focused.final_price)}</b></div>
                <div><span>Số lượng mua</span><b>{focused.quantity}</b></div>
              </div>
              <div className="wh-native-source-note">{focused.product_name} · {focused.variant || 'Mặc định'}</div>

              <div className="panel-section-head"><h3>Ghép SKU bán và quyết định giá</h3></div>
              <div className="wh-native-switch">
                <button type="button" className={mode === 'existing' ? 'active' : ''}
                  onClick={() => setMode('existing')}>Chọn SKU có sẵn</button>
                <button type="button" className={mode === 'new' ? 'active' : ''}
                  onClick={() => { setMode('new'); setSalePrice(''); setVariantId('') }}>Tạo SKU mới</button>
              </div>
              {mode === 'existing'
                ? <label className="wh-native-field"><span>SKU bán trong danh mục</span>
                    <select value={variantId} onChange={e => chooseVariant(e.target.value)}>
                      <option value="">— Chọn SKU —</option>
                      {variants.map(v => <option key={v.id} value={v.id}>{v.products?.sku} · {v.products?.name} · {v.variant_name}</option>)}
                    </select>
                  </label>
                : <div className="wh-native-field-pair">
                    <label className="wh-native-field"><span>Mã SKU bán mới</span><input value={newSku} onChange={e => setNewSku(e.target.value)}/></label>
                    <label className="wh-native-field"><span>Tên sản phẩm bán</span><input value={newName} onChange={e => setNewName(e.target.value)}/></label>
                  </div>}
              <div className="wh-native-field-pair">
                <label className="wh-native-field"><span>Giá bán {mode === 'existing' ? '(sửa được)' : 'mới'}</span>
                  <input type="number" min="0" step="1" value={salePrice} onChange={e => setSalePrice(e.target.value)}/>
                </label>
                <label className="wh-native-field"><span>Hệ số quy đổi</span>
                  <input type="number" min="1" step="1" value={multiplier} onChange={e => setMultiplier(e.target.value)}/>
                </label>
              </div>
              <div className="wh-native-conversion">Số lượng nhập dự kiến: <b>{
                Number.isInteger(Number(multiplier)) && Number(multiplier) > 0
                  ? Number(focused.quantity) * Number(multiplier) : '—'
              }</b></div>

              <div className="panel-section-head"><h3>Quyết định kho theo sản phẩm</h3></div>
              <div className="wh-native-switch">
                <button type="button" className={action === 'IN' ? 'active' : ''} onClick={() => setAction('IN')}>Nhập kho</button>
                <button type="button" className={action === 'SKIP' ? 'active' : ''} onClick={() => setAction('SKIP')}>Bỏ qua kho</button>
              </div>
              {action === 'SKIP' && <label className="wh-native-field"><span>Lý do bỏ qua kho</span>
                <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do"/>
              </label>}
              <div className="wh-native-design-action">
                <button type="button" className="button primary small" onClick={previewOnly}>Xem lựa chọn dự kiến</button>
                <small>Chỉ mô phỏng trên giao diện · không ghi Supabase</small>
              </div>
              {notice && <div className="wh-native-notice" role="status">{notice}</div>}
            </div>}
          </div>}

          {panelTab === 'info' && <div className="wh-native-panel-content">
            <div className="panel-section-head"><h3>Tổng quan đơn hàng</h3></div>
            <div className="wh-native-info-grid">
              <div><span>Mã đơn</span><b>{active.shopee_order_id ?? 'Chưa có'}</b></div>
              <div><span>Nick mua</span><b>{active.erp_users?.username ?? 'Chưa có'}</b></div>
              <div><span>Kho nhận thực tế</span><b>{[batchOf(active)?.warehouses?.code, batchOf(active)?.warehouses?.address].filter(Boolean).join(' · ') || 'Chưa xác định'}</b></div>
              <div><span>Ngày nhận</span><b>{formatDateTime(receivedAt(active))}</b></div>
              <div><span>Trạng thái đơn</span><b>{statusLabel(active.order_status)}</b></div>
              <div><span>Thanh toán</span><b>{statusLabel(active.payment_status)}</b></div>
            </div>
            <div className="panel-section-head"><h3>Giá trị đơn hàng</h3></div>
            <div className="wh-native-info-grid">
              <div><span>Tổng giá gốc</span><b>{valueOrMissing(totalSource(active.order_items, 'original_price'))}</b></div>
              <div><span>Tổng sau giảm</span><b>{valueOrMissing(totalSource(active.order_items, 'final_price'))}</b></div>
              <div><span>COD</span><b>{valueOrMissing(active.cod)}</b></div>
              <div><span>Trả trước</span><b>{valueOrMissing(active.prepaid_amount)}</b></div>
            </div>
            {active.prepaid_source_label && <div className="wh-native-info-line"><span>Nguồn trả trước</span><b>{active.prepaid_source_label}</b></div>}
            <div className="panel-section-head"><h3>Người nhận và vận chuyển</h3></div>
            <div className="wh-native-info-grid">
              <div><span>Người nhận</span><b>{active.recipient_name || 'Chưa có'}</b></div>
              <div><span>Điện thoại</span><b>{formatPhone(active.recipient_phone)}</b></div>
              <div className="full"><span>Địa chỉ</span><b>{active.recipient_address || 'Chưa có'}</b></div>
              <div><span>Khu vực</span><b>{active.area || 'Chưa có'}</b></div>
              <div><span>HUB đích</span><b>{active.destination_hub || 'Chưa có'}</b></div>
              <div><span>Đơn vị vận chuyển</span><b>{activeShipment?.carrier || 'Chưa có'}</b></div>
              <div><span>Mã vận đơn</span><b>{activeShipment?.tracking_number || 'Chưa có'}</b></div>
              <div className="full"><span>Trạng thái vận chuyển</span><b>{statusLabel(activeShipment?.current_tracking_status)}</b></div>
            </div>
            <div className="panel-section-head"><h3>Voucher</h3></div>
            <div className="wh-native-vouchers">
              {active.order_vouchers?.length ? active.order_vouchers.map((v, i) =>
                <div key={i}><b>{v.voucher_code ?? v.voucher_name ?? 'Voucher'}</b><span>{v.voucher_type || 'Chưa phân loại'} · {v.voucher_tag || 'Chưa có tag'}</span></div>)
                : <span>Chưa có voucher</span>}
            </div>
            <div className="panel-section-head"><h3>Sản phẩm trong đơn</h3></div>
            <div className="wh-native-info-items">
              {active.order_items.map(item => <button type="button" key={item.id}
                onClick={() => { setPanelTab('products'); focus(item) }}>
                <span className="wh-native-info-item-name">{item.product_name} · SL {item.quantity}</span>
                <span>Gốc {valueOrMissing(item.original_price)} · Sau giảm {valueOrMissing(item.final_price)}</span>
                </button>)}
            </div>
          </div>}

          {panelTab === 'history' && <div className="whx-history-list">
            {logs.length === 0
              ? <div className="empty compact">Chưa có lịch sử bóc tách của đơn.</div>
              : logs.map(log => <div key={log.id}>
                <i/><div><b>{actionLabel(log.action)}</b><span>{formatDateTime(log.created_at)}</span></div>
              </div>)}
          </div>}
        </div>
      </aside>}
    </div>
  </div>
}
