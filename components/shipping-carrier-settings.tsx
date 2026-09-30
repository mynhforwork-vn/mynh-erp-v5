'use client'

import Link from 'next/link'
import { saveShippingCarrierConfig } from '@/lib/actions/core'

export type ShippingCarrierConfig={
  id:string
  carrier_code:string
  display_name:string
  tracking_prefixes?:string[]|null
  supports_tracking?:boolean|null
  supports_destination_hub?:boolean|null
  priority?:number|null
  is_active?:boolean|null
  note?:string|null
}

export function ShippingCarrierSettings({
  carriers,
  canEdit,
}:{
  carriers:ShippingCarrierConfig[]
  canEdit:boolean
}){
  return <div className="carrier-settings">
    <div className="carrier-settings-head">
      <div>
        <span className="module-eyebrow">VẬN CHUYỂN</span>
        <h3>Đơn vị vận chuyển</h3>
        <p>Quản lý ĐVVC dùng cho tạo đơn, cập nhật nhanh MVĐ và nhận diện tự động theo prefix.</p>
      </div>
      <div className="carrier-settings-summary">
        <span><b>{carriers.filter(x=>x.is_active).length}</b> đang bật</span>
        <span><b>{carriers.filter(x=>x.supports_tracking).length}</b> có Tracking</span>
      </div>
    </div>

    <div className="carrier-settings-note">
      <b>SPX là luồng riêng có HUB kho đích.</b>
      <span>Cấu hình HUB / Phường-Xã / Shipper chỉ áp dụng cho SPX. Các ĐVVC khác không dùng bảng HUB SPX.</span>
      <Link href="/settings?section=spx-hubs">Mở cấu hình SPX →</Link>
    </div>

    <div className="carrier-config-table">
      <div className="carrier-config-head">
        <span>ĐVVC</span>
        <span>Prefix nhận diện</span>
        <span>Tracking</span>
        <span>Ưu tiên</span>
        <span>Trạng thái</span>
        <span></span>
      </div>

      <div className="carrier-config-body">
        {carriers.map(row=><form action={saveShippingCarrierConfig} className="carrier-config-row" key={row.id}>
          <input type="hidden" name="carrier_config_id" value={row.id}/>
          <input type="hidden" name="carrier_code" value={row.carrier_code}/>

          <div className="carrier-identity-cell">
            <span className={'carrier-code-badge '+(row.carrier_code==='SPX'?'spx':'')}>{row.carrier_code}</span>
            <div>
              <input name="display_name" defaultValue={row.display_name} disabled={!canEdit} required/>
              <small>{row.carrier_code==='SPX'?'Có HUB kho đích SPX':'Không dùng HUB SPX'}</small>
            </div>
          </div>

          <input
            name="tracking_prefixes"
            defaultValue={(row.tracking_prefixes??[]).join(', ')}
            placeholder="VD: SPX, SPXVN"
            disabled={!canEdit}
          />

          <label className="carrier-toggle">
            <input type="checkbox" name="supports_tracking" defaultChecked={Boolean(row.supports_tracking)} disabled={!canEdit}/>
            <span>{row.supports_tracking?'Có':'Không'}</span>
          </label>

          <input
            className="carrier-priority-input"
            name="priority"
            type="number"
            min="0"
            defaultValue={row.priority??100}
            disabled={!canEdit}
          />

          <label className="carrier-toggle">
            <input type="checkbox" name="is_active" defaultChecked={Boolean(row.is_active)} disabled={!canEdit}/>
            <span>{row.is_active?'Đang bật':'Tạm tắt'}</span>
          </label>

          <div className="carrier-row-actions">
            {row.carrier_code==='SPX'&&<Link className="button small" href="/settings?section=spx-hubs">HUB SPX</Link>}
            {canEdit&&<button className="button small primary" type="submit">Lưu</button>}
          </div>
        </form>)}
      </div>

      {canEdit&&<form action={saveShippingCarrierConfig} className="carrier-config-row carrier-config-new">
        <div className="carrier-identity-cell new">
          <input name="carrier_code" placeholder="Mã: EMS" required/>
          <input name="display_name" placeholder="Tên ĐVVC mới" required/>
        </div>
        <input name="tracking_prefixes" placeholder="Prefix, cách nhau bằng dấu phẩy"/>
        <label className="carrier-toggle">
          <input type="checkbox" name="supports_tracking" defaultChecked/>
          <span>Có</span>
        </label>
        <input className="carrier-priority-input" name="priority" type="number" min="0" defaultValue="100"/>
        <label className="carrier-toggle">
          <input type="checkbox" name="is_active" defaultChecked/>
          <span>Đang bật</span>
        </label>
        <div className="carrier-row-actions">
          <button className="button small primary" type="submit">+ Thêm ĐVVC</button>
        </div>
      </form>}
    </div>
  </div>
}
