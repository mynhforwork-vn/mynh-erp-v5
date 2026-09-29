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
  shipper_ids?:string[]
  priority?:number|null
  is_active?:boolean|null
}

function ruleCount(row:HubConfig){
  return (row.province_keywords?.length??0)
    +(row.district_keywords?.length??0)
    +(row.address_keywords?.length??0)
}

function HubFields({
  row,
  activeShippers,
  isNew=false,
}:{
  row?:HubConfig
  activeShippers:Shipper[]
  isNew?:boolean
}){
  const selected=new Set(row?.shipper_ids??[])

  return <>
    {!isNew&&row&&<input type="hidden" name="config_id" value={row.id}/>}

    <div className="hub-editor-grid">
      <section className="hub-editor-section">
        <div className="hub-editor-section-head">
          <b>Thông tin HUB</b>
          <span>Tên hiển thị và nhóm khu vực</span>
        </div>
        <div className="hub-editor-fields three">
          <label>
            <span>Mã / tên HUB</span>
            <input name="hub_code" defaultValue={row?.hub_code??''} placeholder="VD: HN-Hai Bà Trưng" required/>
          </label>
          <label>
            <span>Khu vực</span>
            <input name="area" defaultValue={row?.area??''} placeholder="VD: Hà Nội" required/>
          </label>
          <label>
            <span>Miền</span>
            <select name="region" defaultValue={row?.region??'Miền Bắc'}>
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Nam">Miền Nam</option>
            </select>
          </label>
        </div>
      </section>

      <section className="hub-editor-section">
        <div className="hub-editor-section-head">
          <b>Nhận diện địa chỉ</b>
          <span>Từ khóa dùng để tự xác định HUB từ địa chỉ người nhận</span>
        </div>
        <div className="hub-editor-fields three">
          <label>
            <span>Tỉnh / Thành</span>
            <input
              name="province_keywords"
              defaultValue={(row?.province_keywords??[]).join(', ')}
              placeholder="Hà Nội, TP Hà Nội"
            />
          </label>
          <label>
            <span>Quận / Huyện / Phường</span>
            <input
              name="district_keywords"
              defaultValue={(row?.district_keywords??[]).join(', ')}
              placeholder="Hai Bà Trưng, Bạch Mai..."
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
        </div>
      </section>

      <section className="hub-editor-section">
        <div className="hub-editor-section-head">
          <b>Shipper phụ trách</b>
          <span>Một HUB có thể chọn nhiều Shipper</span>
        </div>
        <div className="hub-editor-shippers">
          {!activeShippers.length
            ? <span className="muted">Chưa có Shipper hoạt động.</span>
            : activeShippers.map(s=><label className="hub-editor-shipper" key={s.id}>
                <input
                  type="checkbox"
                  name="shipper_ids"
                  value={s.id}
                  defaultChecked={selected.has(s.id)}
                />
                <span>
                  <b>{s.name}</b>
                  {s.phone&&<small>{s.phone}</small>}
                </span>
              </label>)}
        </div>
      </section>
    </div>

    <div className="hub-editor-footer">
      <label className="hub-editor-priority">
        <span>Ưu tiên nhận diện</span>
        <input name="priority" type="number" min="0" defaultValue={row?.priority??100}/>
      </label>
      <label className="config-toggle">
        <input type="checkbox" name="is_active" defaultChecked={row?.is_active??true}/>
        <span>Đang bật</span>
      </label>
      <button className="button small primary" type="submit">{isNew?'+ Tạo HUB':'Lưu thay đổi'}</button>
    </div>
  </>
}

export function DestinationHubSettings({
  configs,
  shippers,
}:{
  configs:HubConfig[]
  shippers:Shipper[]
}){
  const activeShippers=shippers.filter(s=>s.is_active)
  const activeHubCount=configs.filter(x=>x.is_active).length
  const configuredShipperIds=new Set(configs.flatMap(x=>x.shipper_ids??[]))

  return <div className="destination-settings redesigned">
    <section className="destination-settings-section destination-hub-manager">
      <div className="destination-settings-head redesigned">
        <div>
          <h3>HUB kho đích</h3>
          <span>HUB là cấp quản lý chính. Chỉ mở chi tiết khi cần sửa.</span>
        </div>
        <div className="destination-settings-head-actions">
          <span className="badge">{activeHubCount}/{configs.length} đang bật</span>
          <details className="destination-create-panel">
            <summary className="button small primary">+ Thêm HUB</summary>
            <form action={saveDestinationHubConfig} className="destination-create-form">
              <div className="destination-create-title">
                <div>
                  <b>Tạo HUB kho đích mới</b>
                  <span>Khai báo nhận diện địa chỉ và Shipper phụ trách.</span>
                </div>
              </div>
              <HubFields activeShippers={activeShippers} isNew/>
            </form>
          </details>
        </div>
      </div>

      <div className="destination-hub-list">
        {!configs.length&&<div className="empty compact">Chưa có cấu hình HUB kho đích.</div>}

        {configs.map(row=>{
          const selectedShippers=activeShippers.filter(s=>(row.shipper_ids??[]).includes(s.id))
          const rules=ruleCount(row)

          return <details className="destination-hub-card-v2" key={row.id}>
            <summary className="destination-hub-summary">
              <div className="destination-hub-summary-main">
                <span className={'hub-status-dot '+(row.is_active?'active':'inactive')}/>
                <div>
                  <b>{row.hub_code}</b>
                  <span>{row.area} · {row.region}</span>
                </div>
              </div>

              <div className="destination-hub-summary-metrics">
                <span><b>{rules}</b> rule nhận diện</span>
                <span><b>{selectedShippers.length}</b> Shipper</span>
                <span>Ưu tiên <b>{row.priority??100}</b></span>
                <span className={'hub-state '+(row.is_active?'active':'')}>{row.is_active?'Đang bật':'Đã tắt'}</span>
              </div>

              <span className="destination-hub-chevron">⌄</span>
            </summary>

            <div className="destination-hub-editor">
              <form action={saveDestinationHubConfig}>
                <HubFields row={row} activeShippers={activeShippers}/>
              </form>

              <div className="hub-delete-row">
                <div>
                  <b>Xoá cấu hình HUB</b>
                  <span>Đơn cũ vẫn giữ tên HUB đã ghi nhận; chỉ rule nhận diện và liên kết Shipper hiện tại bị xoá.</span>
                </div>
                <details className="hub-delete-confirm">
                  <summary className="button small danger">Xoá</summary>
                  <form action={deleteDestinationHubConfig}>
                    <input type="hidden" name="config_id" value={row.id}/>
                    <span>Xác nhận xoá <b>{row.hub_code}</b>?</span>
                    <button className="button small danger" type="submit">Xác nhận xoá</button>
                  </form>
                </details>
              </div>
            </div>
          </details>
        })}
      </div>
    </section>

    <section className="destination-settings-section">
      <div className="destination-settings-head redesigned">
        <div>
          <h3>Shipper phụ trách</h3>
          <span>Shipper là cấp phân công bên dưới HUB.</span>
        </div>
        <span className="badge">{activeShippers.length} đang hoạt động</span>
      </div>

      <div className="destination-shipper-list-v2">
        <div className="destination-shipper-list-head">
          <span>Shipper</span>
          <span>SĐT</span>
          <span>HUB phụ trách</span>
          <span>Ghi chú</span>
          <span>Trạng thái</span>
          <span></span>
        </div>

        {shippers.map(shipper=>{
          const assignedCount=configs.filter(h=>(h.shipper_ids??[]).includes(shipper.id)).length
          return <form action={saveDestinationShipper} className="destination-shipper-row-v2" key={shipper.id}>
            <input type="hidden" name="shipper_id" value={shipper.id}/>
            <input name="name" defaultValue={shipper.name} placeholder="Tên Shipper" required/>
            <input name="phone" defaultValue={shipper.phone??''} placeholder="SĐT"/>
            <span className="shipper-hub-count">{assignedCount} HUB</span>
            <input name="note" defaultValue={shipper.note??''} placeholder="Ghi chú"/>
            <label className="config-toggle">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(shipper.is_active)}/>
              <span>{shipper.is_active?'Bật':'Tắt'}</span>
            </label>
            <button className="button small" type="submit">Lưu</button>
          </form>
        })}

        <form action={saveDestinationShipper} className="destination-shipper-row-v2 destination-shipper-new-v2">
          <input name="name" placeholder="Tên Shipper mới" required/>
          <input name="phone" placeholder="SĐT"/>
          <span className="shipper-hub-count">0 HUB</span>
          <input name="note" placeholder="Ghi chú"/>
          <label className="config-toggle">
            <input type="checkbox" name="is_active" defaultChecked/>
            <span>Bật</span>
          </label>
          <button className="button small primary" type="submit">+ Thêm</button>
        </form>
      </div>

      {configuredShipperIds.size===0&&activeShippers.length>0&&
        <div className="destination-settings-hint">Chưa có Shipper nào được gán HUB. Mở một HUB phía trên để phân công.</div>}
    </section>
  </div>
}

export function DestinationHubConfigModal({
  configs,
  shippers,
  closeHref,
}:{
  configs:HubConfig[]
  shippers:Shipper[]
  closeHref:string
}){
  return <div className="settings-modal-backdrop" role="presentation">
    <section className="settings-modal destination-hub-modal" role="dialog" aria-modal="true" aria-label="Cấu hình kho đích">
      <div className="settings-modal-head">
        <div>
          <span className="eyebrow">CÀI ĐẶT HỆ THỐNG</span>
          <h2>HUB kho đích & Shipper</h2>
          <p>Quản lý theo HUB. Một HUB có thể có nhiều Shipper phụ trách.</p>
        </div>
        <div className="settings-modal-actions">
          <Link className="button small" href="/settings">Cài đặt hệ thống</Link>
          <Link className="close" href={closeHref}>×</Link>
        </div>
      </div>
      <div className="settings-modal-scroll">
        <DestinationHubSettings configs={configs} shippers={shippers}/>
      </div>
    </section>
  </div>
}
