'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
import {
  adjustWarehouseStock,
  createWarehouseTransfer,
  dispatchWarehouseTransfer,
  receiveWarehouseTransfer,
  stocktakeWarehouseSku,
} from '@/lib/actions/warehouse'

type Warehouse={id:string,code:string,name:string,address?:string|null}
type BalanceOption={
  warehouse_id:string
  warehouse_code:string
  product_variant_id:string
  sku:string
  product_name:string
  variant_name:string
  quantity:number
}
type Transfer={
  id:string
  status:string
  created_at:string
  from_warehouse?:{code?:string|null}|null
  to_warehouse?:{code?:string|null}|null
  transfer_items?:Array<{
    quantity:number
    product_variants?:{
      variant_name?:string|null
      products?:{sku?:string|null,name?:string|null}|null
    }|null
  }>|null
}

export function WarehouseStockTools({
  warehouses,
  balances,
  recentTransfers,
  defaultReceivingWarehouseId,
}:{
  warehouses:Warehouse[]
  balances:BalanceOption[]
  recentTransfers:Transfer[]
  defaultReceivingWarehouseId?:string|null
}){
  const [tool,setTool]=useState<'stocktake'|'transfer'|'adjust'|null>(null)
  const [warehouseId,setWarehouseId]=useState(defaultReceivingWarehouseId??'')
  const [transferFrom,setTransferFrom]=useState(defaultReceivingWarehouseId??'')
  const wrapRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    if(!tool)return
    function outside(event:PointerEvent){
      const target=event.target as Node|null
      if(target&&!wrapRef.current?.contains(target))setTool(null)
    }
    function esc(event:KeyboardEvent){
      if(event.key==='Escape')setTool(null)
    }
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',esc)
    return ()=>{
      document.removeEventListener('pointerdown',outside)
      document.removeEventListener('keydown',esc)
    }
  },[tool])

  const warehouseBalances=useMemo(
    ()=>warehouseId?balances.filter(row=>row.warehouse_id===warehouseId):balances,
    [balances,warehouseId]
  )
  const transferBalances=useMemo(
    ()=>transferFrom?balances.filter(row=>row.warehouse_id===transferFrom&&row.quantity>0):[],
    [balances,transferFrom]
  )

  return <div className="whx-stock-tools" ref={wrapRef}>
    <button className={'button small '+(tool==='stocktake'?'active':'')} type="button" onClick={()=>setTool(tool==='stocktake'?null:'stocktake')}>
      Kiểm kê kho
    </button>
    <button className={'button small '+(tool==='transfer'?'active':'')} type="button" onClick={()=>setTool(tool==='transfer'?null:'transfer')}>
      Chuyển kho
    </button>
    <button className={'button small '+(tool==='adjust'?'active':'')} type="button" onClick={()=>setTool(tool==='adjust'?null:'adjust')}>
      Điều chỉnh tồn
    </button>

    {tool==='stocktake'&&<div className="whx-tool-popover wide">
      <div className="whx-tool-head">
        <div><b>Kiểm kê kho</b><span>Đối chiếu tồn hệ thống với số lượng thực tế.</span></div>
        <button type="button" onClick={()=>setTool(null)}>×</button>
      </div>
      <form action={stocktakeWarehouseSku}>
        <label><span>Kho</span>
          <select name="warehouse_id" required value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}>
            <option value="" disabled>Chọn kho</option>
            {warehouses.map(w=><option value={w.id} key={w.id}>{w.code} · {w.address||w.name}</option>)}
          </select>
        </label>
        <label><span>SKU kiểm kê</span>
          <select name="product_variant_id" required defaultValue="">
            <option value="" disabled>Chọn SKU</option>
            {warehouseBalances.map(row=><option key={row.warehouse_id+'-'+row.product_variant_id} value={row.product_variant_id}>
              {row.sku} · {row.variant_name} · hệ thống {row.quantity}
            </option>)}
          </select>
        </label>
        <label><span>Tồn thực tế</span><input name="actual_quantity" type="number" min="0" step="1" required/></label>
        <label><span>Ghi chú</span><input name="note" placeholder="VD: Kiểm kê cuối ngày"/></label>
        <div className="whx-tool-actions">
          <button className="button small" type="button" onClick={()=>setTool(null)}>Hủy</button>
          <button className="button primary small" type="submit">Xác nhận kiểm kê</button>
        </div>
      </form>
    </div>}

    {tool==='adjust'&&<div className="whx-tool-popover">
      <div className="whx-tool-head">
        <div><b>Điều chỉnh tồn</b><span>Dùng cho phát sinh lẻ ngoài kiểm kê.</span></div>
        <button type="button" onClick={()=>setTool(null)}>×</button>
      </div>
      <form action={adjustWarehouseStock}>
        <label><span>Kho</span>
          <select name="warehouse_id" required value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}>
            <option value="" disabled>Chọn kho</option>
            {warehouses.map(w=><option value={w.id} key={w.id}>{w.code} · {w.address||w.name}</option>)}
          </select>
        </label>
        <label><span>SKU</span>
          <select name="product_variant_id" required defaultValue="">
            <option value="" disabled>Chọn SKU</option>
            {warehouseBalances.map(row=><option key={row.warehouse_id+'-'+row.product_variant_id} value={row.product_variant_id}>
              {row.sku} · {row.variant_name} · tồn {row.quantity}
            </option>)}
          </select>
        </label>
        <div className="whx-tool-grid">
          <label><span>Loại</span>
            <select name="direction" defaultValue="IN">
              <option value="IN">Tăng tồn</option>
              <option value="OUT">Giảm tồn</option>
            </select>
          </label>
          <label><span>Số lượng</span><input name="quantity" type="number" min="1" step="1" required/></label>
        </div>
        <label><span>Lý do</span><input name="note" required placeholder="VD: Hàng hỏng / phát hiện thừa"/></label>
        <div className="whx-tool-actions">
          <button className="button small" type="button" onClick={()=>setTool(null)}>Hủy</button>
          <button className="button primary small" type="submit">Ghi điều chỉnh</button>
        </div>
      </form>
    </div>}

    {tool==='transfer'&&<div className="whx-tool-popover transfer">
      <div className="whx-tool-head">
        <div><b>Chuyển kho</b><span>Chức năng tùy chọn, chỉ dùng khi cần điều chuyển tồn.</span></div>
        <button type="button" onClick={()=>setTool(null)}>×</button>
      </div>

      <form action={createWarehouseTransfer}>
        <div className="whx-tool-grid">
          <label><span>Kho nguồn</span>
            <select name="from_warehouse_id" required value={transferFrom} onChange={e=>setTransferFrom(e.target.value)}>
              <option value="" disabled>Chọn kho nguồn</option>
              {warehouses.map(w=><option value={w.id} key={w.id}>{w.code} · {w.address||w.name}</option>)}
            </select>
          </label>
          <label><span>Kho đích</span>
            <select name="to_warehouse_id" required defaultValue="">
              <option value="" disabled>Chọn kho đích</option>
              {warehouses.filter(w=>w.id!==transferFrom).map(w=><option value={w.id} key={w.id}>{w.code} · {w.address||w.name}</option>)}
            </select>
          </label>
        </div>
        <label><span>SKU cần chuyển</span>
          <select name="product_variant_id" required defaultValue="">
            <option value="" disabled>Chọn SKU đang có tồn</option>
            {transferBalances.map(row=><option key={row.product_variant_id} value={row.product_variant_id}>
              {row.sku} · {row.variant_name} · tồn {row.quantity}
            </option>)}
          </select>
        </label>
        <div className="whx-tool-grid">
          <label><span>Số lượng</span><input name="quantity" type="number" min="1" step="1" required/></label>
          <label><span>Ghi chú</span><input name="note" placeholder="Không bắt buộc"/></label>
        </div>
        <div className="whx-tool-actions">
          <button className="button primary small" type="submit">Tạo phiếu chuyển</button>
        </div>
      </form>

      <div className="whx-transfer-list">
        <div className="whx-transfer-list-head"><b>Phiếu gần đây</b><span>{recentTransfers.length}</span></div>
        {!recentTransfers.length
          ? <div className="empty compact">Chưa có phiếu chuyển kho.</div>
          : recentTransfers.slice(0,6).map(transfer=><div className="whx-transfer-row" key={transfer.id}>
              <div>
                <b>{String(transfer.id).slice(0,8)}</b>
                <span>{transfer.from_warehouse?.code??'—'} → {transfer.to_warehouse?.code??'—'} · {transfer.transfer_items?.[0]?.product_variants?.products?.sku??'SKU'}</span>
              </div>
              <div>
                <span className={'status-pill '+(transfer.status==='RECEIVED'?'green':transfer.status==='IN_TRANSIT'?'orange':'gray')}>
                  {transfer.status==='DRAFT'?'Nháp':transfer.status==='IN_TRANSIT'?'Đang chuyển':transfer.status==='RECEIVED'?'Đã nhận':transfer.status}
                </span>
                {transfer.status==='DRAFT'&&<form action={dispatchWarehouseTransfer}>
                  <input type="hidden" name="transfer_id" value={transfer.id}/>
                  <button className="whx-text-button" type="submit">Xuất chuyển</button>
                </form>}
                {transfer.status==='IN_TRANSIT'&&<form action={receiveWarehouseTransfer}>
                  <input type="hidden" name="transfer_id" value={transfer.id}/>
                  <button className="whx-text-button" type="submit">Xác nhận nhận</button>
                </form>}
              </div>
            </div>)}
      </div>
    </div>}
  </div>
}
