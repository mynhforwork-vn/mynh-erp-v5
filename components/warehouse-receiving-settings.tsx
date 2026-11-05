'use client'

import { useEffect,useRef,useState } from 'react'
import { createPortal } from 'react-dom'
import { saveReceivingWarehouseSettings } from '@/lib/actions/warehouse'

type Warehouse={
  id:string
  code:string
  name:string
  address?:string|null
}

export function WarehouseReceivingSettings({
  warehouses,
  defaultReceivingWarehouseId,
  previewOnly=false,
  dockToWorkspace=false,
}:{
  warehouses:Warehouse[]
  defaultReceivingWarehouseId?:string|null
  previewOnly?:boolean
  dockToWorkspace?:boolean
}){
  const [open,setOpen]=useState(false)
  const [dockNode,setDockNode]=useState<HTMLElement|null>(null)
  const wrapRef=useRef<HTMLDivElement|null>(null)
  const active=warehouses.find(w=>w.id===defaultReceivingWarehouseId)??null

  useEffect(()=>{
    if(!dockToWorkspace)return
    // Mount the settings panel inside the same workspace grid as the detail
    // slidebar. Never anchor it above the KPI/table as an absolute popover.
    setDockNode(document.querySelector<HTMLElement>('.wh-native-workspace'))
  },[dockToWorkspace])

  useEffect(()=>{
    if(!open)return
    function outside(event:PointerEvent){
      const target=event.target as Node|null
      if(!dockToWorkspace && target && !wrapRef.current?.contains(target))setOpen(false)
    }
    function esc(event:KeyboardEvent){
      if(event.key==='Escape')setOpen(false)
    }
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',esc)
    return ()=>{
      document.removeEventListener('pointerdown',outside)
      document.removeEventListener('keydown',esc)
    }
  },[open,dockToWorkspace])

  const settingsContent = <>
      <div className="whx-settings-head">
        <div>
          <span className="module-eyebrow">CẤU HÌNH KHO</span>
          <b>Kho nhận hàng mặc định</b>
          <small>Kho được chọn sẵn khi bóc tách nhập kho và các thao tác tồn.</small>
        </div>
        <button type="button" onClick={()=>setOpen(false)} aria-label="Đóng cài đặt Kho nhận">×</button>
      </div>

      <form action={previewOnly ? undefined : saveReceivingWarehouseSettings}>
        {previewOnly&&<div className="whx-settings-preview-readonly" role="status">
          Preview chỉ xem cấu hình thực tế. Lưu thay đổi kho mặc định được khóa để không ghi vào Production.
        </div>}
        <label>
          <span>Kho nhận mặc định</span>
          <select name="default_receiving_warehouse_id" required defaultValue={defaultReceivingWarehouseId??''} disabled={previewOnly}>
            <option value="" disabled>Chọn kho nhận</option>
            {warehouses.map(warehouse=><option value={warehouse.id} key={warehouse.id}>
              {warehouse.code} · {warehouse.address||warehouse.name}
            </option>)}
          </select>
        </label>

        <div className="whx-settings-current">
          <span>Đang sử dụng</span>
          {active
            ? <div><b>{active.code} · {active.address||active.name}</b><small>{active.name}</small></div>
            : <div><b>Chưa cấu hình</b><small>Cần chọn kho nhận mặc định.</small></div>}
        </div>

        <div className="whx-settings-list">
          <div className="whx-settings-list-head">
            <b>Danh sách kho đang hoạt động</b>
            <span>{warehouses.length} kho</span>
          </div>
          {warehouses.map(warehouse=><div className={warehouse.id===defaultReceivingWarehouseId?'active':''} key={warehouse.id}>
            <div>
              <b>{warehouse.code}</b>
              <span>{warehouse.name}</span>
            </div>
            <small>{warehouse.address||'Chưa có địa chỉ'}</small>
            {warehouse.id===defaultReceivingWarehouseId&&<i>Mặc định</i>}
          </div>)}
        </div>

        <div className="whx-settings-actions">
          <button className="button small" type="button" onClick={()=>setOpen(false)}>Đóng</button>
          <button className="button primary small" type="submit" disabled={previewOnly}>{previewOnly?'Chỉ xem Preview':'Lưu cấu hình'}</button>
        </div>
      </form>
    </>

  return <div className="whx-settings-wrap" ref={wrapRef}>
    <button
      type="button"
      className={'button '+(open?'active':'')}
      onClick={()=>setOpen(value=>!value)}
      aria-expanded={open}
    >
      Cài đặt Kho nhận
    </button>

    {open && (dockToWorkspace && dockNode
      ? createPortal(<aside className="whx-settings-popover mynh-slide-panel wh-native-settings-panel"
          data-system-slidebar="true" role="region" aria-label="Cài đặt Kho nhận">
          {settingsContent}
        </aside>,dockNode)
      : <div className="whx-settings-popover">{settingsContent}</div>)}
  </div>
}
