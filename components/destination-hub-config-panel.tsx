'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  deleteDestinationHubConfig,
  saveDestinationHubConfig,
  saveDestinationShipper,
} from '@/lib/actions/core'

type Shipper={
  id:string
  name:string
  phone?:string|null
  note?:string|null
  is_active?:boolean|null
}
type HubConfig={
  id:string
  hub_code:string
  area:string
  region:string
  province_keywords?:string[]|null
  district_keywords?:string[]|null
  address_keywords?:string[]|null
  carrier_code?:string|null
  tracking_location_aliases?:string[]|null
  shipper_ids?:string[]
  priority?:number|null
  is_active?:boolean|null
}
type HubTab='info'|'wards'|'shippers'
type ManagerMode='hubs'|'shippers'

function normalizeRoutingKey(value:string){
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d')
    .replace(/Đ/g,'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
}

function uniqueRoutingValues(values?:string[]|null){
  const seen=new Set<string>()
  return (values??[]).filter(value=>{
    const key=normalizeRoutingKey(String(value))
    if(!key||seen.has(key))return false
    seen.add(key)
    return true
  })
}

function HubEditor({
  row,
  shippers,
  tab,
  isNew=false,
  canEdit,
}:{
  row?:HubConfig
  shippers:Shipper[]
  tab:HubTab
  isNew?:boolean
  canEdit:boolean
}){
  const selected=new Set(row?.shipper_ids??[])
  const wards=uniqueRoutingValues(row?.district_keywords)
  const assignmentOptions=shippers.filter(s=>s.is_active||selected.has(s.id))

  return <div className="destination-hub-detail-body">
    <form action={saveDestinationHubConfig} className="destination-hub-edit-form">
      <fieldset className="destination-readonly-fieldset" disabled={!canEdit}>
      {!isNew&&row&&<input type="hidden" name="config_id" value={row.id}/>}
      <input type="hidden" name="carrier_code" value="SPX"/>

      <div className={'destination-tab-panel '+(tab==='info'?'active':'')}>
        <div className="destination-field-grid">
          <label>
            <span>Mã / tên HUB</span>
            <input
              name="hub_code"
              defaultValue={row?.hub_code??''}
              placeholder="VD: HUB Thanh Trì"
              required
            />
          </label>
          <label>
            <span>Khu vực</span>
            <input
              name="area"
              defaultValue={row?.area??''}
              placeholder="VD: Hà Nội"
              required
            />
          </label>
          <label>
            <span>Miền</span>
            <select name="region" defaultValue={row?.region??'Miền Bắc'}>
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Nam">Miền Nam</option>
            </select>
          </label>
          <label>
            <span>Ưu tiên nhận diện</span>
            <input name="priority" type="number" min="0" defaultValue={row?.priority??100}/>
          </label>
          <label>
            <span>Location SPX nhận diện kho đích</span>
            <input
              name="tracking_location_aliases"
              defaultValue={(row?.tracking_location_aliases??[]).join(', ')}
              placeholder="VD: 17-BGG Bac Giang 3 Hub"
            />
          </label>
        </div>

        <div className="destination-info-note">
          <div>
            <b>Nguyên tắc nhận diện kho đích</b>
            <span>Tracking chỉ coi là “Đến kho đích” khi location SPX khớp chính xác Mã HUB hoặc một alias đã khai báo ở trên. Phường/Xã chỉ dùng định tuyến nghiệp vụ, không tự biến một kho SPX thành kho đích.</span>
          </div>
          <label className="destination-switch">
            <input type="checkbox" name="is_active" defaultChecked={row?.is_active??true}/>
            <span>HUB đang hoạt động</span>
          </label>
        </div>
      </div>

      <div className={'destination-tab-panel '+(tab==='wards'?'active':'')}>
        <div className="destination-ward-layout">
          <div className="destination-ward-side">
            <label>
              <span>Tỉnh / Thành phố</span>
              <input
                name="province_keywords"
                defaultValue={(row?.province_keywords??[]).join(', ')}
                placeholder="VD: Hà Nội"
              />
            </label>
            <label>
              <span>Từ khóa bổ sung</span>
              <input
                name="address_keywords"
                defaultValue={(row?.address_keywords??[]).join(', ')}
                placeholder="Tên đường / cụm địa chỉ đặc biệt"
              />
            </label>
            <div className="destination-ward-help">
              <b>{wards.length} Phường/Xã</b>
              <span>Địa chỉ chỉ cần khớp một phường/xã trong danh sách để nhận diện về HUB.</span>
            </div>
          </div>

          <label className="destination-ward-list-field">
            <span>Danh sách Phường / Xã</span>
            <textarea
              name="ward_keywords"
              defaultValue={wards.join('\n')}
              placeholder={'Phường Thanh Liệt\nXã Tân Triều\nXã Tả Thanh Oai'}
              rows={10}
            />
            <small>Mỗi dòng một Phường/Xã. Hệ thống tự loại nội dung trùng sau khi chuẩn hóa dấu.</small>
          </label>
        </div>
      </div>

      <div className={'destination-tab-panel '+(tab==='shippers'?'active':'')}>
        <div className="destination-assignment-head">
          <div>
            <b>Shipper phụ trách HUB</b>
            <span>Chọn nhiều Shipper. Không gắn cứng từng Shipper với từng Phường/Xã.</span>
          </div>
          <span className="destination-count-pill">{selected.size} đang gán</span>
        </div>

        <div className="destination-assignment-list">
          {!assignmentOptions.length
            ? <div className="destination-empty">Chưa có Shipper. Mở “Shipper SPX” để thêm mới.</div>
            : assignmentOptions.map(shipper=><label className="destination-assignment-row" key={shipper.id}>
                <input
                  type="checkbox"
                  name="shipper_ids"
                  value={shipper.id}
                  defaultChecked={selected.has(shipper.id)}
                />
                <span className="destination-shipper-avatar">{shipper.name.slice(0,1).toUpperCase()}</span>
                <span className="destination-assignment-person">
                  <b>{shipper.name}</b>
                  <small>{shipper.phone||'Chưa có SĐT'}</small>
                </span>
                <span className={'destination-status-dot '+(shipper.is_active?'active':'')}/>
                <span className="destination-assignment-state">{shipper.is_active?'Hoạt động':'Tạm dừng'}</span>
              </label>)}
        </div>
      </div>

      <div className="destination-detail-footer">
        <span>{canEdit?(isNew?'Tạo HUB mới và lưu cấu hình':'Các thay đổi chỉ áp dụng sau khi bấm Lưu'):'Chế độ chỉ xem · Viewer không có quyền chỉnh sửa'}</span>
        {canEdit&&<button className="button primary" type="submit">{isNew?'Tạo HUB':'Lưu thay đổi'}</button>}
      </div>
      </fieldset>
    </form>

    {canEdit&&!isNew&&row&&
      <div className="destination-danger-zone">
        <div>
          <b>Xoá HUB</b>
          <span>Đơn cũ vẫn giữ HUB đã ghi nhận. Chỉ cấu hình nhận diện và liên kết Shipper hiện tại bị xoá.</span>
        </div>
        <details className="destination-delete-confirm">
          <summary className="button danger">Xoá HUB</summary>
          <form action={deleteDestinationHubConfig}>
            <input type="hidden" name="config_id" value={row.id}/>
            <span>Xác nhận xoá <b>{row.hub_code}</b>?</span>
            <button className="button danger" type="submit">Xác nhận xoá</button>
          </form>
        </details>
      </div>}
  </div>
}

function ShipperManager({
  configs,
  shippers,
  onBack,
  canEdit,
}:{
  configs:HubConfig[]
  shippers:Shipper[]
  onBack:()=>void
  canEdit:boolean
}){
  return <div className="destination-shipper-manager">
    <div className="destination-detail-head">
      <div>
        <span className="module-eyebrow">SPX · DANH MỤC SHIPPER</span>
        <h3>Shipper phụ trách SPX</h3>
        <p>Shipper có thể được gán cho nhiều HUB. Việc gán HUB thực hiện tại tab Shipper của từng HUB.</p>
      </div>
      <button type="button" className="button" onClick={onBack}>← Quay lại HUB</button>
    </div>

    <div className="destination-shipper-manager-table">
      <div className="destination-shipper-manager-head">
        <span>Shipper</span>
        <span>SĐT</span>
        <span>HUB phụ trách</span>
        <span>Ghi chú</span>
        <span>Trạng thái</span>
        <span></span>
      </div>

      <div className="destination-shipper-manager-body">
        {shippers.map(shipper=>{
          const assignedHubs=configs.filter(h=>(h.shipper_ids??[]).includes(shipper.id))
          return <form action={saveDestinationShipper} className="destination-shipper-manager-row" key={shipper.id}>
            <fieldset className="destination-readonly-fieldset" disabled={!canEdit}>
            <input type="hidden" name="shipper_id" value={shipper.id}/>
            <label className="destination-shipper-name-field">
              <span className="destination-shipper-avatar">{shipper.name.slice(0,1).toUpperCase()}</span>
              <input name="name" defaultValue={shipper.name} placeholder="Tên Shipper" required/>
            </label>
            <input name="phone" defaultValue={shipper.phone??''} placeholder="SĐT"/>
            <div className="destination-hub-chip-list">
              {!assignedHubs.length
                ? <span className="destination-hub-chip muted">0 HUB</span>
                : assignedHubs.slice(0,3).map(h=><span className="destination-hub-chip" key={h.id}>{h.hub_code}</span>)}
              {assignedHubs.length>3&&<span className="destination-hub-chip muted">+{assignedHubs.length-3}</span>}
            </div>
            <input name="note" defaultValue={shipper.note??''} placeholder="Ghi chú"/>
            <label className="destination-switch compact">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(shipper.is_active)}/>
              <span>{shipper.is_active?'Hoạt động':'Tạm dừng'}</span>
            </label>
            {canEdit&&<button className="button" type="submit">Lưu</button>}
            </fieldset>
          </form>
        })}
      </div>

      {canEdit&&<form action={saveDestinationShipper} className="destination-shipper-manager-row destination-shipper-new-row">
        <label className="destination-shipper-name-field">
          <span className="destination-shipper-avatar">+</span>
          <input name="name" placeholder="Tên Shipper mới" required/>
        </label>
        <input name="phone" placeholder="SĐT"/>
        <div className="destination-hub-chip-list"><span className="destination-hub-chip muted">0 HUB</span></div>
        <input name="note" placeholder="Ghi chú"/>
        <label className="destination-switch compact">
          <input type="checkbox" name="is_active" defaultChecked/>
          <span>Hoạt động</span>
        </label>
        <button className="button primary" type="submit">+ Thêm</button>
      </form>}
    </div>
  </div>
}

export function DestinationHubSettings({
  configs,
  shippers,
  canEdit,
}:{
  configs:HubConfig[]
  shippers:Shipper[]
  canEdit:boolean
}){
  const [mode,setMode]=useState<ManagerMode>('hubs')
  const [selectedId,setSelectedId]=useState<string>(configs[0]?.id??'__new__')
  const [tab,setTab]=useState<HubTab>('wards')

  useEffect(()=>{
    if(selectedId==='__new__')return
    if(!configs.some(h=>h.id===selectedId))setSelectedId(configs[0]?.id??'__new__')
  },[configs,selectedId])

  const selectedHub=useMemo(
    ()=>configs.find(h=>h.id===selectedId),
    [configs,selectedId]
  )
  const isNew=selectedId==='__new__'
  const activeHubCount=configs.filter(x=>x.is_active).length
  const activeShipperCount=shippers.filter(x=>x.is_active).length

  function pickHub(id:string){
    setMode('hubs')
    setSelectedId(id)
    setTab('wards')
  }

  return <div className="destination-master-detail">
    <div className="destination-manager-toolbar">
      <div className="destination-manager-switch">
        <button
          type="button"
          className={mode==='hubs'?'active':''}
          onClick={()=>setMode('hubs')}
        >
          SPX · HUB & địa bàn
          <small>{configs.length} HUB</small>
        </button>
        <button
          type="button"
          className={mode==='shippers'?'active':''}
          onClick={()=>setMode('shippers')}
        >
          Shipper SPX
          <small>{activeShipperCount} hoạt động</small>
        </button>
      </div>
      <div className="destination-manager-health">
        <span><i className="green"/>{activeHubCount} HUB bật</span>
        <span><i className="blue"/>{activeShipperCount} Shipper</span>
      </div>
    </div>

    {mode==='hubs'
      ? <div className="destination-master-grid">
          <aside className="destination-hub-rail">
            <div className="destination-hub-rail-head">
              <div>
                <b>HUB kho đích SPX</b>
                <span>Chọn HUB để chỉnh sửa</span>
              </div>
              {canEdit&&<button
                type="button"
                className="button primary"
                onClick={()=>{setSelectedId('__new__');setTab('info')}}
              >
                + Thêm HUB
              </button>}
            </div>

            <div className="destination-hub-rail-list">
              {configs.map(hub=>{
                const wards=uniqueRoutingValues(hub.district_keywords)
                const assigned=(hub.shipper_ids??[]).length
                return <button
                  type="button"
                  key={hub.id}
                  className={'destination-hub-rail-item '+(selectedId===hub.id?'active':'')}
                  onClick={()=>pickHub(hub.id)}
                >
                  <span className={'destination-rail-accent '+(hub.is_active?'active':'')}/>
                  <span className="destination-hub-rail-copy">
                    <b>{hub.hub_code}</b>
                    <small>{wards.length} Phường/Xã · {assigned} Shipper</small>
                  </span>
                  <span className={'destination-mini-state '+(hub.is_active?'active':'')}>
                    {hub.is_active?'Bật':'Tắt'}
                  </span>
                </button>
              })}
              {!configs.length&&<div className="destination-empty">Chưa có HUB kho đích.</div>}
            </div>
          </aside>

          <section className="destination-hub-detail">
            <div className="destination-detail-head">
              <div>
                <span className="module-eyebrow">{isNew?'TẠO MỚI':'HUB ĐANG CHỌN'}</span>
                <h3>{isNew?'Tạo HUB kho đích SPX':selectedHub?.hub_code??'Chọn HUB'}</h3>
                <p>
                  {isNew
                    ? 'Khai báo thông tin, danh sách Phường/Xã và Shipper phụ trách.'
                    : [selectedHub?.area,selectedHub?.region].filter(Boolean).join(' · ')}
                </p>
              </div>
              {!isNew&&selectedHub&&
                <div className="destination-detail-summary">
                  <span><b>{uniqueRoutingValues(selectedHub.district_keywords).length}</b> Phường/Xã</span>
                  <span><b>{selectedHub.shipper_ids?.length??0}</b> Shipper</span>
                  <span className={selectedHub.is_active?'active':''}>{selectedHub.is_active?'Đang hoạt động':'Tạm dừng'}</span>
                </div>}
            </div>

            <div className="destination-detail-tabs">
              <button type="button" className={tab==='info'?'active':''} onClick={()=>setTab('info')}>Thông tin HUB</button>
              <button type="button" className={tab==='wards'?'active':''} onClick={()=>setTab('wards')}>
                Phường/Xã {!isNew&&selectedHub?<span>{uniqueRoutingValues(selectedHub.district_keywords).length}</span>:null}
              </button>
              <button type="button" className={tab==='shippers'?'active':''} onClick={()=>setTab('shippers')}>
                Shipper {!isNew&&selectedHub?<span>{selectedHub.shipper_ids?.length??0}</span>:null}
              </button>
            </div>

            <HubEditor
              key={isNew?'new':selectedHub?.id}
              row={isNew?undefined:selectedHub}
              shippers={shippers}
              tab={tab}
              isNew={isNew}
              canEdit={canEdit}
            />
          </section>
        </div>
      : <ShipperManager configs={configs} shippers={shippers} onBack={()=>setMode('hubs')} canEdit={canEdit}/>} 
  </div>
}

export function DestinationHubConfigModal({
  configs,
  shippers,
  closeHref,
  canEdit,
}:{
  configs:HubConfig[]
  shippers:Shipper[]
  closeHref:string
  canEdit:boolean
}){
  return <div className="settings-modal-backdrop" role="presentation">
    <section className="settings-modal destination-hub-modal destination-hub-modal-v3" role="dialog" aria-modal="true" aria-label="Cấu hình kho đích SPX">
      <div className="settings-modal-head">
        <div>
          <span className="eyebrow">CÀI ĐẶT HỆ THỐNG</span>
          <h2>Cấu hình kho đích SPX</h2>
          <p>Cấu hình riêng cho SPX: HUB → nhiều Phường/Xã → nhiều Shipper.</p>
        </div>
        <div className="settings-modal-actions">
          <Link className="button" href="/settings?section=spx-hubs">Mở module Cài đặt ↗</Link>
          <Link className="close" href={closeHref}>×</Link>
        </div>
      </div>
      <div className="settings-modal-scroll destination-modal-workspace">
        <DestinationHubSettings configs={configs} shippers={shippers} canEdit={canEdit}/>
      </div>
    </section>
  </div>
}
