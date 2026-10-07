'use client'

import { useMemo,useState } from 'react'
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
type Tab='rules'|'provider'|'mapping'

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
  return String(value??fallback).slice(0,5)
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
  const [tab,setTab]=useState<Tab>('rules')
  const providerMap=useMemo(()=>new Map(providers.map(x=>[String(x.carrier).toUpperCase(),x])),[providers])
  const canonicalOptions=rules.filter(x=>x.is_active)
  const sortedRules=[...rules].sort((a,b)=>a.sort_order-b.sort_order)
  const trackingCarriers=carriers.filter(x=>x.is_active&&x.supports_tracking)

  return <div className="tracking-settings tracking-settings-v6">
    {trackingTest==='ok'&&<div className="settings-result success">Tracking test thành công: {trackingMessage}</div>}
    {trackingTest==='fail'&&<div className="settings-result error">Tracking test thất bại: {trackingMessage||'Không xác định'}</div>}

    <div className="destination-detail-tabs settings-subtabs-v6">
      <button type="button" className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>
        Chu kỳ & trạng thái <span>{sortedRules.length}</span>
      </button>
      <button type="button" className={tab==='provider'?'active':''} onClick={()=>setTab('provider')}>
        Provider <span>{providers.filter(x=>x.enabled).length}</span>
      </button>
      <button type="button" className={tab==='mapping'?'active':''} onClick={()=>setTab('mapping')}>
        Mapping <span>{mappings.length}</span>
      </button>
    </div>

    {tab==='rules'&&<div className="settings-subtab-body-v6">
      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">TRACKING ENGINE</span>
            <h3>Cấu hình chung</h3>
            <p>Cron claim đơn đến hạn; Manual Sync hoạt động độc lập với giờ nghỉ.</p>
          </div>
          <span className={'settings-mini-status '+(runtime?.auto_tracking_enabled!==false?'on':'')}>
            {runtime?.auto_tracking_enabled!==false?'Auto Tracking bật':'Auto Tracking tắt'}
          </span>
        </div>

        <form action={saveTrackingRuntimeSettings} className="tracking-runtime-grid-v6">
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
            <span>Retry provider lỗi (phút)</span>
            <input name="retry_minutes" defaultValue={(runtime?.retry_minutes??[10,30,60]).join(', ')} disabled={!canEdit}/>
          </label>
          {canEdit&&<button className="button primary" type="submit">Lưu cấu hình</button>}
        </form>
      </section>

      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">CHU KỲ THEO TRẠNG THÁI</span>
            <h3>Toàn bộ trạng thái Tracking</h3>
            <p>Trạng thái kết thúc được khóa STOP; các trạng thái khác có chu kỳ riêng.</p>
          </div>
        </div>

        <div className="tracking-table-v6">
          <div className="tracking-table-head-v6 tracking-rule-grid-v6">
            <span>Trạng thái</span><span>Phase</span><span>Auto</span><span>Chu kỳ</span><span>Loại</span><span></span>
          </div>
          {sortedRules.map(rule=><form action={saveTrackingRule} className="tracking-table-row-v6 tracking-rule-grid-v6" key={rule.status_code}>
            <input type="hidden" name="status_code" value={rule.status_code}/>
            <div className="tracking-status-cell-v6">
              <b>{rule.label}</b>
              <code>{rule.status_code}</code>
            </div>
            <span>{PHASE_LABEL[rule.phase]??rule.phase}</span>
            {rule.terminal
              ? <span className="tracking-stop-v6">STOP</span>
              : <label className="settings-check compact-check-v6">
                  <input type="checkbox" name="auto_tracking" defaultChecked={rule.auto_tracking} disabled={!canEdit}/>
                  <span>{rule.auto_tracking?'Bật':'Tắt'}</span>
                </label>}
            {rule.terminal
              ? <span>—</span>
              : <label className="tracking-cycle-input-v6">
                  <input name="interval_minutes" type="number" min="15" max="1440" step="5" defaultValue={rule.interval_minutes??120} disabled={!canEdit}/>
                  <span>phút</span>
                </label>}
            <span>{rule.terminal?'Kết thúc':'Theo dõi'}</span>
            {canEdit&&!rule.terminal?<button className="button small" type="submit">Lưu</button>:<span/>}
          </form>)}
        </div>
      </section>
    </div>}

    {tab==='provider'&&<div className="settings-subtab-body-v6">
      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">TRACKING PROVIDER</span>
            <h3>Kết nối nguồn hành trình</h3>
            <p>SPX dùng adapter trực tiếp của MYNH ERP; ĐVVC khác dùng endpoint JSON chuẩn hóa.</p>
          </div>
        </div>

        <div className="provider-settings-list provider-settings-list-v6">
          {trackingCarriers.map(carrier=>{
            const code=carrier.carrier_code.toUpperCase()
            const row=providerMap.get(code)
            const isSpx=code==='SPX'
            return <form action={saveTrackingProviderConfig} className="provider-settings-row provider-settings-row-v6" key={code}>
              <input type="hidden" name="carrier" value={code}/>
              <input type="hidden" name="adapter_type" value={isSpx?'SPX_PUBLIC':(row?.adapter_type??'NORMALIZED_JSON')}/>
              <div className="provider-name">
                <b>{code} · {carrier.display_name}</b>
                <span>{isSpx?'SPX Direct · public tracking':row?.adapter_type??'NORMALIZED_JSON'}</span>
              </div>

              {isSpx
                ? <div className="provider-source-v6">
                    <span>Endpoint</span>
                    <code>https://spx.vn/shipment/order/open/order/get_order_info</code>
                    <small>GET · timeout 10.000 ms · không cần credential</small>
                    <input type="hidden" name="endpoint_url" value="https://spx.vn/shipment/order/open/order/get_order_info"/>
                    <input type="hidden" name="http_method" value="GET"/>
                    <input type="hidden" name="timeout_ms" value="10000"/>
                  </div>
                : <div className="provider-config-grid-v6">
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
                      <span>Timeout ms</span>
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
                  </div>}

              <div className="provider-actions-v6">
                <label className="settings-check">
                  <input type="checkbox" name="enabled" defaultChecked={Boolean(row?.enabled)} disabled={!canEdit}/>
                  <span>Bật provider</span>
                </label>
                {canEdit&&row?.auth_secret_id&&!isSpx&&<label className="settings-check subtle"><input type="checkbox" name="clear_secret"/><span>Xóa credential</span></label>}
                {canEdit&&<button className="button small primary" type="submit">Lưu</button>}
              </div>
            </form>
          })}
        </div>

        {canEdit&&<form action={testTrackingConnection} className="telegram-test-form tracking-test-form-v6">
          <label className="settings-field">
            <span>Mã vận đơn test</span>
            <input name="tracking_number" placeholder="SPXVN..." required/>
          </label>
          <label className="settings-field compact">
            <span>ĐVVC</span>
            <select name="carrier" defaultValue="SPX">
              {trackingCarriers.map(x=><option value={x.carrier_code} key={x.carrier_code}>{x.carrier_code}</option>)}
            </select>
          </label>
          <button className="button" type="submit">Kiểm tra kết nối</button>
        </form>}

        <div className="settings-inline-note">
          <b>Kho đích chỉ nhận diện bằng cấu hình thật.</b> SPX chỉ chuyển thành <code>ARRIVED_DESTINATION_HUB</code> khi location khớp HUB/alias trong <Link href="/settings?section=shipping&shipping_tab=hubs">Cấu hình vận chuyển → Kho đích</Link>.
        </div>
      </section>
    </div>}

    {tab==='mapping'&&<div className="settings-subtab-body-v6">
      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">RAW STATUS MAPPING</span>
            <h3>Raw status chưa nhận diện</h3>
            <p>Raw code mới được giữ nguyên event và đưa về UNKNOWN cho tới khi được map.</p>
          </div>
          <span className="settings-mini-status">{unknownRaw.length} cần xử lý</span>
        </div>

        <div className="provider-settings-list">
          {unknownRaw.map(row=><form action={saveCarrierStatusMapping} className="provider-settings-row mapping-row-v6" key={row.carrier+'-'+row.raw_code}>
            <input type="hidden" name="carrier" value={row.carrier}/>
            <input type="hidden" name="raw_code" value={row.raw_code}/>
            <input type="hidden" name="raw_name" value={row.raw_name??''}/>
            <div className="provider-name">
              <b>{row.carrier} · {row.raw_code||'(không mã)'}</b>
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
          {!unknownRaw.length&&<div className="settings-inline-note">Không có raw status mới cần xử lý.</div>}
        </div>
      </section>

      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">MAPPING HIỆN CÓ</span>
            <h3>Danh sách mapping provider → MYNH ERP</h3>
            <p>Hiển thị toàn bộ mapping; không ẩn trong danh sách thu gọn.</p>
          </div>
          <span className="settings-mini-status">{mappings.length} mapping</span>
        </div>

        <div className="tracking-mapping-table-v6">
          <div className="tracking-mapping-head-v6">
            <span>Provider / Raw code</span><span>Tên raw</span><span>MYNH status</span><span>Bật</span><span></span>
          </div>
          {mappings.map(row=><form action={saveCarrierStatusMapping} className="tracking-mapping-row-v6" key={row.id}>
            <input type="hidden" name="carrier" value={row.carrier}/>
            <input type="hidden" name="raw_code" value={row.raw_code}/>
            <div className="tracking-status-cell-v6"><b>{row.carrier} · {row.raw_code}</b><code>{row.note||'—'}</code></div>
            <input name="raw_name" defaultValue={row.raw_name??''} disabled={!canEdit}/>
            <select name="canonical_status" defaultValue={row.canonical_status} disabled={!canEdit}>
              {canonicalOptions.map(x=><option value={x.status_code} key={x.status_code}>{x.label} · {x.status_code}</option>)}
            </select>
            <label className="settings-check compact-check-v6"><input type="checkbox" name="is_active" defaultChecked={row.is_active} disabled={!canEdit}/><span>Bật</span></label>
            {canEdit?<button className="button small" type="submit">Lưu</button>:<span/>}
          </form>)}
        </div>
      </section>
    </div>}
  </div>
}
