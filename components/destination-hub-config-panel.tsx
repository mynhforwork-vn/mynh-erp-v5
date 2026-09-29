import Link from 'next/link'
import { saveDestinationHubConfig, saveDestinationShipper } from '@/lib/actions/core'

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

export function DestinationHubSettings({
  configs,
  shippers,
}:{
  configs:HubConfig[]
  shippers:Shipper[]
}){
  const activeShippers=shippers.filter(s=>s.is_active)

  return <div className="destination-settings">
    <section className="destination-settings-section">
      <div className="destination-settings-head">
        <div>
          <h3>Hub kho đích</h3>
          <span>Địa chỉ → Khu vực / Miền → Hub kho đích → Shipper phụ trách</span>
        </div>
        <span className="badge">{configs.filter(x=>x.is_active).length} đang bật</span>
      </div>

      <div className="destination-hub-table-wrap">
        <div className="destination-hub-table-head">
          <span>Hub / Khu vực</span>
          <span>Nhận diện địa chỉ</span>
          <span>Shipper phụ trách</span>
          <span>Ưu tiên</span>
          <span></span>
        </div>

        <div className="destination-hub-table-body">
          {configs.map(row=><form action={saveDestinationHubConfig} className="destination-hub-row" key={row.id}>
            <input type="hidden" name="config_id" value={row.id}/>

            <div className="hub-identity-fields">
              <input name="hub_code" defaultValue={row.hub_code} required aria-label="Mã hub"/>
              <input name="area" defaultValue={row.area} required aria-label="Khu vực"/>
              <select name="region" defaultValue={row.region} aria-label="Miền">
                <option value="Miền Bắc">Miền Bắc</option>
                <option value="Miền Trung">Miền Trung</option>
                <option value="Miền Nam">Miền Nam</option>
              </select>
            </div>

            <div className="hub-keyword-fields">
              <input name="province_keywords" defaultValue={(row.province_keywords??[]).join(', ')} placeholder="Tỉnh / Thành" aria-label="Tỉnh thành"/>
              <input name="district_keywords" defaultValue={(row.district_keywords??[]).join(', ')} placeholder="Quận / Huyện / Phường" aria-label="Quận huyện phường"/>
              <input name="address_keywords" defaultValue={(row.address_keywords??[]).join(', ')} placeholder="Từ khóa bổ sung" aria-label="Từ khóa bổ sung"/>
            </div>

            <div className="hub-shipper-checks" aria-label="Shipper phụ trách">
              {!activeShippers.length
                ? <span className="muted">Chưa có Shipper</span>
                : activeShippers.map(s=><label key={s.id} className="hub-shipper-check">
                    <input
                      type="checkbox"
                      name="shipper_ids"
                      value={s.id}
                      defaultChecked={(row.shipper_ids??[]).includes(s.id)}
                    />
                    <span><b>{s.name}</b>{s.phone&&<small>{s.phone}</small>}</span>
                  </label>)}
            </div>

            <div className="hub-priority-fields">
              <input name="priority" type="number" min="0" defaultValue={row.priority??100} aria-label="Ưu tiên"/>
              <label className="config-toggle">
                <input type="checkbox" name="is_active" defaultChecked={Boolean(row.is_active)}/>
                <span>Bật</span>
              </label>
            </div>

            <button className="button small" type="submit">Lưu</button>
          </form>)}

          <form action={saveDestinationHubConfig} className="destination-hub-row destination-hub-new">
            <div className="hub-identity-fields">
              <input name="hub_code" placeholder="Mã hub" required/>
              <input name="area" placeholder="Khu vực" required/>
              <select name="region" defaultValue="Miền Bắc">
                <option value="Miền Bắc">Miền Bắc</option>
                <option value="Miền Trung">Miền Trung</option>
                <option value="Miền Nam">Miền Nam</option>
              </select>
            </div>

            <div className="hub-keyword-fields">
              <input name="province_keywords" placeholder="Tỉnh / Thành"/>
              <input name="district_keywords" placeholder="Quận / Huyện / Phường"/>
              <input name="address_keywords" placeholder="Từ khóa bổ sung"/>
            </div>

            <div className="hub-shipper-checks" aria-label="Shipper phụ trách">
              {!activeShippers.length
                ? <span className="muted">Chưa có Shipper</span>
                : activeShippers.map(s=><label key={s.id} className="hub-shipper-check">
                    <input type="checkbox" name="shipper_ids" value={s.id}/>
                    <span><b>{s.name}</b>{s.phone&&<small>{s.phone}</small>}</span>
                  </label>)}
            </div>

            <div className="hub-priority-fields">
              <input name="priority" type="number" min="0" defaultValue="100"/>
              <label className="config-toggle">
                <input type="checkbox" name="is_active" defaultChecked/>
                <span>Bật</span>
              </label>
            </div>

            <button className="button small primary" type="submit">+ Thêm</button>
          </form>
        </div>
      </div>
    </section>

    <section className="destination-settings-section">
      <div className="destination-settings-head">
        <div>
          <h3>Danh sách Shipper</h3>
          <span>Một Shipper có thể phụ trách nhiều Hub kho đích.</span>
        </div>
        <span className="badge">{activeShippers.length} đang hoạt động</span>
      </div>

      <div className="destination-shipper-grid">
        {shippers.map(shipper=><form action={saveDestinationShipper} className="destination-shipper-card" key={shipper.id}>
          <input type="hidden" name="shipper_id" value={shipper.id}/>
          <div className="shipper-card-main">
            <input name="name" defaultValue={shipper.name} placeholder="Tên Shipper" required/>
            <input name="phone" defaultValue={shipper.phone??''} placeholder="SĐT"/>
            <input name="note" defaultValue={shipper.note??''} placeholder="Ghi chú"/>
          </div>
          <label className="config-toggle">
            <input type="checkbox" name="is_active" defaultChecked={Boolean(shipper.is_active)}/>
            <span>Bật</span>
          </label>
          <button className="button small" type="submit">Lưu</button>
        </form>)}

        <form action={saveDestinationShipper} className="destination-shipper-card destination-shipper-new">
          <div className="shipper-card-main">
            <input name="name" placeholder="Tên Shipper mới" required/>
            <input name="phone" placeholder="SĐT"/>
            <input name="note" placeholder="Ghi chú"/>
          </div>
          <label className="config-toggle">
            <input type="checkbox" name="is_active" defaultChecked/>
            <span>Bật</span>
          </label>
          <button className="button small primary" type="submit">+ Thêm</button>
        </form>
      </div>
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
          <h2>Kho đích & Shipper</h2>
          <p>Xem theo Hub kho đích. Một Hub có thể nhiều Shipper và một Shipper có thể phụ trách nhiều Hub.</p>
        </div>
        <Link className="close" href={closeHref}>×</Link>
      </div>
      <div className="settings-modal-scroll">
        <DestinationHubSettings configs={configs} shippers={shippers}/>
      </div>
    </section>
  </div>
}
