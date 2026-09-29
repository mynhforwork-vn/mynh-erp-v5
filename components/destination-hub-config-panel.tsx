import Link from 'next/link'
import { saveDestinationHubConfig } from '@/lib/actions/core'

type HubConfig={
  id:string
  hub_code:string
  area:string
  region:string
  province_keywords?:string[]|null
  district_keywords?:string[]|null
  address_keywords?:string[]|null
  shipper_name?:string|null
  shipper_phone?:string|null
  priority?:number|null
  is_active?:boolean|null
}

export function DestinationHubConfigPanel({
  configs,
  closeHref,
}:{
  configs:HubConfig[]
  closeHref:string
}){
  return <aside className="detail-panel destination-hub-panel">
    <div className="panel-head">
      <div>
        <span className="eyebrow">ĐƠN NHẬP HÀNG</span>
        <h2>Cấu hình kho đích</h2>
      </div>
      <Link className="close" href={closeHref}>×</Link>
    </div>

    <div className="destination-hub-panel-intro">
      <b>Luồng tự nhận diện</b>
      <span>Địa chỉ nhận → Khu vực / Miền → Kho đích → Shipper phụ trách</span>
    </div>

    <div className="panel-scroll destination-hub-panel-scroll">
      <div className="destination-hub-config-list">
        {configs.map(row=><form action={saveDestinationHubConfig} className="destination-hub-config-card" key={row.id}>
          <input type="hidden" name="config_id" value={row.id}/>

          <div className="destination-hub-config-title">
            <div>
              <b>{row.hub_code}</b>
              <span>{row.area} · {row.region}</span>
            </div>
            <label className="config-toggle">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(row.is_active)}/>
              <span>Bật</span>
            </label>
          </div>

          <div className="form-grid">
            <label>Mã hub<input name="hub_code" defaultValue={row.hub_code} required/></label>
            <label>Khu vực<input name="area" defaultValue={row.area} required/></label>
          </div>

          <div className="form-grid">
            <label>Miền
              <select name="region" defaultValue={row.region}>
                <option value="Miền Bắc">Miền Bắc</option>
                <option value="Miền Trung">Miền Trung</option>
                <option value="Miền Nam">Miền Nam</option>
              </select>
            </label>
            <label>Ưu tiên<input name="priority" type="number" min="0" defaultValue={row.priority??100}/></label>
          </div>

          <label>Tỉnh / Thành
            <input name="province_keywords" defaultValue={(row.province_keywords??[]).join(', ')} placeholder="Hà Nội, Ha Noi"/>
          </label>

          <label>Quận / Huyện
            <input name="district_keywords" defaultValue={(row.district_keywords??[]).join(', ')} placeholder="Hai Bà Trưng, Hai Ba Trung"/>
          </label>

          <label>Từ khóa bổ sung
            <input name="address_keywords" defaultValue={(row.address_keywords??[]).join(', ')} placeholder="Phường / đường / khu vực đặc thù"/>
          </label>

          <div className="form-grid">
            <label>Shipper phụ trách
              <input name="shipper_name" defaultValue={row.shipper_name??''} placeholder="Tên Shipper"/>
            </label>
            <label>SĐT Shipper
              <input name="shipper_phone" defaultValue={row.shipper_phone??''} placeholder="Số điện thoại"/>
            </label>
          </div>

          <div className="destination-hub-config-actions">
            <span>{row.is_active?'Đang dùng để tự nhận diện':'Đang tắt'}</span>
            <button className="button small primary" type="submit">Lưu</button>
          </div>
        </form>)}
      </div>

      <form action={saveDestinationHubConfig} className="destination-hub-config-card destination-hub-config-new">
        <div className="destination-hub-config-title">
          <div><b>+ Thêm kho đích</b><span>Tạo rule nhận diện mới</span></div>
          <label className="config-toggle">
            <input type="checkbox" name="is_active" defaultChecked/>
            <span>Bật</span>
          </label>
        </div>

        <div className="form-grid">
          <label>Mã hub<input name="hub_code" placeholder="VD: HN-Đống Đa" required/></label>
          <label>Khu vực<input name="area" placeholder="Hà Nội" required/></label>
        </div>

        <div className="form-grid">
          <label>Miền
            <select name="region" defaultValue="Miền Bắc">
              <option value="Miền Bắc">Miền Bắc</option>
              <option value="Miền Trung">Miền Trung</option>
              <option value="Miền Nam">Miền Nam</option>
            </select>
          </label>
          <label>Ưu tiên<input name="priority" type="number" min="0" defaultValue="100"/></label>
        </div>

        <label>Tỉnh / Thành<input name="province_keywords" placeholder="Hà Nội, Ha Noi"/></label>
        <label>Quận / Huyện<input name="district_keywords" placeholder="Đống Đa, Dong Da"/></label>
        <label>Từ khóa bổ sung<input name="address_keywords" placeholder="Phường / đường / từ khóa đặc thù"/></label>

        <div className="form-grid">
          <label>Shipper phụ trách<input name="shipper_name" placeholder="Tên Shipper"/></label>
          <label>SĐT Shipper<input name="shipper_phone" placeholder="Số điện thoại"/></label>
        </div>

        <div className="destination-hub-config-actions">
          <span>Rule mới</span>
          <button className="button small primary" type="submit">+ Thêm</button>
        </div>
      </form>
    </div>
  </aside>
}
