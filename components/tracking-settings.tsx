import Link from 'next/link'
import {
  saveCarrierStatusMapping,
  saveTrackingProviderConfig,
  saveTrackingRule,
  saveTrackingRuntimeSettings,
  testTrackingConnection,
} from '@/lib/actions/core'

type RuntimeSettings={
  auto_tracking_enabled:boolean
  quiet_start:string
  quiet_end:string
  retry_minutes:number[]
}
type Rule={
  status_code:string
  label:string
  phase:string
  interval_minutes:number|null
  auto_tracking:boolean
  terminal:boolean
  sort_order:number
  is_active:boolean
}
type Carrier={carrier_code:string;display_name:string;supports_tracking?:boolean|null;is_active?:boolean|null}
type Provider={
  carrier:string;enabled:boolean;adapter_type:string;endpoint_url:string;http_method:string;timeout_ms:number;
  auth_header_name?:string|null;auth_secret_id?:string|null;
}
type Mapping={
  id:string;carrier:string;raw_code:string;raw_name?:string|null;canonical_status:string;
  note?:string|null;is_active:boolean;priority:number;
}
type UnknownRaw={
  carrier:string
  raw_code:string
  raw_name:string|null
  description:string|null
  count:number
}

const PHASE_LABEL:Record<string,string>={
  PRE_SHIP:'Trước lấy hàng',
  TRANSPORT:'Trung chuyển',
  DESTINATION:'Kho đích',
  DELIVERY:'Giao hàng',
  RETURN:'Hoàn hàng',
  FINAL:'Kết thúc',
  UNKNOWN:'Chưa xác định',
}

function timeValue(value:string|undefined,fallback:string){
  const v=String(value??fallback)
  return v.slice(0,5)
}

export function TrackingSettings({
  runtime,
  rules,
  carriers,
  providers,
  mappings,
  unknownRaw,
  canEdit,
  trackingTest,
  trackingMessage,
}:{
  runtime:RuntimeSettings|null
  rules:Rule[]
  carriers:Carrier[]
  providers:Provider[]
  mappings:Mapping[]
  unknownRaw:UnknownRaw[]
  canEdit:boolean
  trackingTest?:string|null
  trackingMessage?:string|null
}){
  const providerMap=new Map(providers.map(x=>[String(x.carrier).toUpperCase(),x]))
  const canonicalOptions=rules.filter(x=>x.is_active)

  return <div className="tracking-settings tracking-telegram-settings">
    {trackingTest==='ok'&&<div className="settings-result success">Tracking test thành công: {trackingMessage}</div>}
    {trackingTest==='fail'&&<div className="settings-result error">Tracking test thất bại: {trackingMessage||'Không xác định'}</div>}

    <section className="settings-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">TRACKING ENGINE</span>
          <h3>Quy tắc vận hành chung</h3>
          <p>Cron chỉ claim đơn đến hạn. Manual Sync vẫn hoạt động độc lập với giờ nghỉ.</p>
        </div>
        <span className={'settings-mini-status '+(runtime?.auto_tracking_enabled!==false?'on':'')}>
          {runtime?.auto_tracking_enabled!==false?'Auto Tracking bật':'Auto Tracking tắt'}
        </span>
      </div>

      <form action={saveTrackingRuntimeSettings} className="telegram-main-form">
        <div className="telegram-config-grid">
          <label className="settings-check">
            <input type="checkbox" name="auto_tracking_enabled" defaultChecked={runtime?.auto_tracking_enabled!==false} disabled={!canEdit}/>
            <span>Bật Auto Tracking</span>
          </label>
          <label className="settings-field compact">
            <span>Giờ nghỉ từ</span>
            <input name="quiet_start" type="time" defaultValue={timeValue(runtime?.quiet_start,'02:00')} disabled={!canEdit}/>
          </label>
          <label className="settings-field compact">
            <span>Đến</span>
            <input name="quiet_end" type="time" defaultValue={timeValue(runtime?.quiet_end,'06:00')} disabled={!canEdit}/>
          </label>
          <label className="settings-field">
            <span>Retry khi provider lỗi (phút)</span>
            <input name="retry_minutes" defaultValue={(runtime?.retry_minutes??[10,30,60]).join(', ')} placeholder="10, 30, 60" disabled={!canEdit}/>
          </label>
        </div>
        {canEdit&&<div className="settings-actions"><button className="button primary" type="submit">Lưu quy tắc chung</button></div>}
      </form>
    </section>

    <section className="settings-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">CHU KỲ THEO TRẠNG THÁI</span>
          <h3>Thời gian Tracking từng trạng thái</h3>
          <p>Mỗi trạng thái active có chu kỳ riêng. Trạng thái kết thúc bị khóa STOP.</p>
        </div>
        <span className="settings-mini-status">{rules.filter(x=>!x.terminal&&x.auto_tracking).length} trạng thái đang tự động</span>
      </div>

      <div className="provider-settings-list">
        {rules.sort((a,b)=>a.sort_order-b.sort_order).map(rule=><form action={saveTrackingRule} className="provider-settings-row" key={rule.status_code}>
          <input type="hidden" name="status_code" value={rule.status_code}/>
          <div className="provider-name">
            <b>{rule.label}</b>
            <span>{PHASE_LABEL[rule.phase]??rule.phase} · {rule.status_code}</span>
          </div>
          {rule.terminal
            ? <div className="settings-field wide"><span>Auto Tracking</span><b>DỪNG · không cho chỉnh</b></div>
            : <>
                <label className="settings-field compact">
                  <span>Chu kỳ</span>
                  <input name="interval_minutes" type="number" min="15" max="1440" step="5" defaultValue={rule.interval_minutes??120} disabled={!canEdit}/>
                </label>
                <div className="settings-field compact"><span>Đơn vị</span><b>phút</b></div>
                <label className="settings-check">
                  <input type="checkbox" name="auto_tracking" defaultChecked={rule.auto_tracking} disabled={!canEdit}/>
                  <span>Auto</span>
                </label>
              </>}
          {canEdit&&!rule.terminal&&<div className="provider-row-actions"><button className="button small primary" type="submit">Lưu</button></div>}
        </form>)}
      </div>
    </section>

    <section className="settings-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">TRACKING PROVIDER</span>
          <h3>Kết nối nguồn hành trình</h3>
          <p>SPX dùng adapter trực tiếp của MYNH ERP. ĐVVC khác có thể dùng endpoint JSON chuẩn hóa.</p>
        </div>
        <span className="settings-mini-status">{providers.filter(x=>x.enabled).length} provider đang bật</span>
      </div>

      <div className="provider-settings-list">
        {carriers.filter(x=>x.is_active&&x.supports_tracking).map(carrier=>{
          const code=carrier.carrier_code.toUpperCase()
          const row=providerMap.get(code)
          const isSpx=code==='SPX'
          return <form action={saveTrackingProviderConfig} className="provider-settings-row" key={code}>
            <input type="hidden" name="carrier" value={code}/>
            <input type="hidden" name="adapter_type" value={isSpx?'SPX_PUBLIC':(row?.adapter_type??'NORMALIZED_JSON')}/>
            <div className="provider-name">
              <b>{code}</b>
              <span>{carrier.display_name}</span>
            </div>
            {isSpx
              ? <div className="settings-field wide">
                  <span>Nguồn</span>
                  <b>SPX Direct · public tracking</b>
                  <input type="hidden" name="endpoint_url" value="https://spx.vn/shipment/order/open/order/get_order_info"/>
                  <input type="hidden" name="http_method" value="GET"/>
                  <input type="hidden" name="timeout_ms" value="10000"/>
                </div>
              : <>
                  <label className="settings-field wide">
                    <span>Normalized endpoint HTTPS</span>
                    <input name="endpoint_url" type="url" defaultValue={row?.endpoint_url??''} placeholder="https://provider.example/track" disabled={!canEdit}/>
                  </label>
                  <label className="settings-field compact">
                    <span>Method</span>
                    <select name="http_method" defaultValue={row?.http_method??'GET'} disabled={!canEdit}>
                      <option value="GET">GET</option><option value="POST">POST</option>
                    </select>
                  </label>
                  <label className="settings-field compact">
                    <span>Timeout</span>
                    <input name="timeout_ms" type="number" min="1000" max="30000" step="500" defaultValue={row?.timeout_ms??8000} disabled={!canEdit}/>
                  </label>
                  <label className="settings-field">
                    <span>Auth header</span>
                    <input name="auth_header_name" defaultValue={row?.auth_header_name??''} placeholder="Authorization" disabled={!canEdit}/>
                  </label>
                  <label className="settings-field">
                    <span>Credential</span>
                    <input name="auth_secret" type="password" placeholder={row?.auth_secret_id?'Đã lưu · nhập để thay':'Bearer / API key'} disabled={!canEdit}/>
                  </label>
                </>}
            <label className="settings-check">
              <input type="checkbox" name="enabled" defaultChecked={Boolean(row?.enabled)} disabled={!canEdit}/>
              <span>Bật</span>
            </label>
            {canEdit&&<div className="provider-row-actions">
              {row?.auth_secret_id&&!isSpx&&<label className="settings-check subtle"><input type="checkbox" name="clear_secret"/><span>Xóa credential</span></label>}
              <button className="button small primary" type="submit">Lưu</button>
            </div>}
          </form>
        })}
      </div>

      {canEdit&&<form action={testTrackingConnection} className="telegram-test-form">
        <label className="settings-field">
          <span>Test mã vận đơn</span>
          <input name="tracking_number" placeholder="SPXVN..." required/>
        </label>
        <label className="settings-field compact">
          <span>ĐVVC</span>
          <select name="carrier" defaultValue="SPX">
            {carriers.filter(x=>x.is_active&&x.supports_tracking).map(x=><option value={x.carrier_code} key={x.carrier_code}>{x.carrier_code}</option>)}
          </select>
        </label>
        <button className="button" type="submit">Kiểm tra kết nối</button>
      </form>}

      <div className="settings-inline-note">
        <b>Kho đích không suy luận từ chữ “Last Mile”.</b> SPX chỉ được chuẩn hóa thành <code>ARRIVED_DESTINATION_HUB</code> khi location khớp HUB hoặc alias đang bật trong <Link href="/settings?section=spx-hubs">SPX · Kho đích</Link>.
      </div>
    </section>

    <section className="settings-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">RAW STATUS MAPPING</span>
          <h3>Mapping trạng thái SPX</h3>
          <p>Raw code mới không làm hỏng Tracking: hệ thống lưu event và đưa về UNKNOWN cho tới khi được map.</p>
        </div>
        <span className="settings-mini-status">{mappings.length} mapping · {unknownRaw.length} raw chưa nhận diện</span>
      </div>

      <div className="provider-settings-list">
        {unknownRaw.map(row=><form action={saveCarrierStatusMapping} className="provider-settings-row" key={row.carrier+'-'+row.raw_code}>
          <input type="hidden" name="carrier" value={row.carrier}/>
          <input type="hidden" name="raw_code" value={row.raw_code}/>
          <input type="hidden" name="raw_name" value={row.raw_name??''}/>
          <div className="provider-name">
            <b>{row.raw_code||'(không mã)'}</b>
            <span>{row.raw_name||row.description||'Raw status mới'} · {row.count} event</span>
          </div>
          <label className="settings-field wide">
            <span>Map thành</span>
            <select name="canonical_status" defaultValue="UNKNOWN" disabled={!canEdit}>
              {canonicalOptions.map(x=><option value={x.status_code} key={x.status_code}>{x.label} · {x.status_code}</option>)}
            </select>
          </label>
          <input type="hidden" name="is_active" value="on"/>
          {canEdit&&<button className="button small primary" type="submit">Lưu mapping</button>}
        </form>)}
        {!unknownRaw.length&&<div className="settings-inline-note">Chưa có raw status mới cần xử lý.</div>}
      </div>

      <details>
        <summary className="button small">Xem {mappings.length} mapping hiện có</summary>
        <div className="provider-settings-list">
          {mappings.map(row=><form action={saveCarrierStatusMapping} className="provider-settings-row" key={row.id}>
            <input type="hidden" name="carrier" value={row.carrier}/>
            <input type="hidden" name="raw_code" value={row.raw_code}/>
            <div className="provider-name"><b>{row.carrier} · {row.raw_code}</b><span>{row.raw_name||'—'}</span></div>
            <input name="raw_name" defaultValue={row.raw_name??''} disabled={!canEdit}/>
            <select name="canonical_status" defaultValue={row.canonical_status} disabled={!canEdit}>
              {canonicalOptions.map(x=><option value={x.status_code} key={x.status_code}>{x.label}</option>)}
            </select>
            <label className="settings-check"><input type="checkbox" name="is_active" defaultChecked={row.is_active} disabled={!canEdit}/><span>Bật</span></label>
            {canEdit&&<button className="button small" type="submit">Lưu</button>}
          </form>)}
        </div>
      </details>
    </section>
  </div>
}
