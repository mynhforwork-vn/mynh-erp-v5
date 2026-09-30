'use client'

import { useEffect,useRef,useState } from 'react'
import Link from 'next/link'
import { adjustWarehouseInventory,stocktakeWarehouseInventory } from '@/lib/actions/core'

type Warehouse={id:string,code:string,name:string}
type Variant={
  id:string
  variant_name:string
  products?:{sku?:string|null,name?:string|null}|null
}

export function WarehouseInventoryTools({
  warehouses,
  variants,
}:{
  warehouses:Warehouse[]
  variants:Variant[]
}){
  const [open,setOpen]=useState<'stocktake'|'adjust'|null>(null)
  const wrapRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    if(!open)return
    function onPointerDown(event:PointerEvent){
      const target=event.target as Node|null
      if(target&&!wrapRef.current?.contains(target))setOpen(null)
    }
    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape')setOpen(null)
    }
    document.addEventListener('pointerdown',onPointerDown)
    document.addEventListener('keydown',onKeyDown)
    return ()=>{
      document.removeEventListener('pointerdown',onPointerDown)
      document.removeEventListener('keydown',onKeyDown)
    }
  },[open])

  const defaultWarehouse=warehouses[0]?.id??''

  return <div className="warehouse-inventory-tools" ref={wrapRef}>
    <button
      type="button"
      className={'button small '+(open==='stocktake'?'active':'')}
      onClick={()=>setOpen(v=>v==='stocktake'?null:'stocktake')}
      aria-expanded={open==='stocktake'}
    >Kiểm kê kho</button>

    <Link className="button small" href="/warehouse/transfers">Chuyển kho</Link>

    <button
      type="button"
      className={'button small '+(open==='adjust'?'active':'')}
      onClick={()=>setOpen(v=>v==='adjust'?null:'adjust')}
      aria-expanded={open==='adjust'}
    >Điều chỉnh tồn</button>

    {open==='stocktake'&&<div className="warehouse-tool-popover warehouse-tool-popover-stocktake">
      <div className="warehouse-tool-popover-head">
        <div><b>Kiểm kê nhanh theo SKU</b><span>Nhập tồn thực tế, hệ thống tự ghi chênh lệch vào lịch sử.</span></div>
        <button type="button" onClick={()=>setOpen(null)} aria-label="Đóng">×</button>
      </div>
      <form action={stocktakeWarehouseInventory}>
        <label>Kho
          <select name="warehouse_id" required defaultValue={defaultWarehouse}>
            {warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </label>
        <label>SKU kiểm kê
          <select name="product_variant_id" required defaultValue="">
            <option value="" disabled>Chọn SKU bán</option>
            {variants.map(v=><option key={v.id} value={v.id}>
              {v.products?.sku} · {v.products?.name} · {v.variant_name}
            </option>)}
          </select>
        </label>
        <label>Tồn thực tế
          <input name="actual_quantity" type="number" min="0" step="1" required placeholder="0"/>
        </label>
        <label>Ghi chú
          <input name="note" placeholder="VD: Kiểm kê cuối ngày"/>
        </label>
        <div className="warehouse-tool-actions">
          <button type="button" className="button small" onClick={()=>setOpen(null)}>Hủy</button>
          <button type="submit" className="button primary small">Xác nhận kiểm kê</button>
        </div>
      </form>
    </div>}

    {open==='adjust'&&<div className="warehouse-tool-popover">
      <div className="warehouse-tool-popover-head">
        <div><b>Điều chỉnh tồn</b><span>Dùng cho phát sinh lẻ ngoài phiên kiểm kê.</span></div>
        <button type="button" onClick={()=>setOpen(null)} aria-label="Đóng">×</button>
      </div>
      <form action={adjustWarehouseInventory}>
        <label>Kho
          <select name="warehouse_id" required defaultValue={defaultWarehouse}>
            {warehouses.map(w=><option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </label>
        <label>SKU
          <select name="product_variant_id" required defaultValue="">
            <option value="" disabled>Chọn SKU bán</option>
            {variants.map(v=><option key={v.id} value={v.id}>
              {v.products?.sku} · {v.products?.name} · {v.variant_name}
            </option>)}
          </select>
        </label>
        <div className="warehouse-tool-two">
          <label>Loại
            <select name="direction" required defaultValue="IN">
              <option value="IN">Tăng tồn</option>
              <option value="OUT">Giảm tồn</option>
            </select>
          </label>
          <label>Số lượng
            <input name="quantity" type="number" min="1" step="1" required/>
          </label>
        </div>
        <label>Lý do
          <input name="note" required placeholder="VD: Hàng hỏng / phát hiện thừa"/>
        </label>
        <div className="warehouse-tool-actions">
          <button type="button" className="button small" onClick={()=>setOpen(null)}>Hủy</button>
          <button type="submit" className="button primary small">Ghi điều chỉnh</button>
        </div>
      </form>
    </div>}
  </div>
}
