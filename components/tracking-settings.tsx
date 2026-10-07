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
type Tab='rules'|'mapping'

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
  const [editingMapping,setEditingMapping]=useState<string|null>(null)

  const providerMap=useMemo(()=>new Map(providers.map(x=>[String(x.carrier).toUpperCase(),x])),[providers])
  const canonicalOptions=rules.filter(x=>x.is_active)
  const canonicalMap=useMemo(()=>new Map(rules.map(x=>[x.status_code,x])),[rules])
  const sortedRules=[...rules].sort((a,b)=>a.sort_order-b.sort_order)
  const trackingCarriers=carriers.filter(x=>x.is_active&&x.supports_tracking)
  const spxCarrier=trackingCarriers.find(x=>x.carrier_code.toUpperCase()==='SPX')
  const spxProvider=providerMap.get('SPX')
  const advancedCarriers=trackingCarriers.filter(x=>x.carrier_code.toUpperCase()!=='SPX')

  return <div className="tracking-settings tracking-settings-v7">
    {trackingTest==='ok'&&<div className="settings-result success">Tracking test thành công: {trackingMessage}</div>}
    {trackingTest==='fail'&&<div className="settings-result error">Tracking test thất bại: {trackingMessage||'Không xác định'}</div>}

    <div className="destination-detail-tabs settings-subtabs-v6 tracking-subtabs-v7">
      <button type="button" className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>
        Chu kỳ & trạng thái <span>{sortedRules.length}</span>
      </button>
      <button type="button" className={tab==='mapping'?'active':''} onClick={()=>setTab('mapping')}>
        Mapping trạng thái <span>{mappings.length}</span>
      </button>
    </div>

    {tab==='rules'&&<div className="settings-subtab-body-v6 tracking-rules-body-v7">
      <section className="tracking-runtime-panel-v7">
        <div className="tracking-runtime-head-v7">
          <div>
            <span className="module-eyebrow">TRACKING ENGINE</span>
            <h3>Quy tắc vận hành</h3>
          </div>
          <span className={'tracking-engine-state-v7 '+(runtime?.auto_tracking_enabled!==false?'on':'')}>
            {runtime?.auto_tracking_enabled!==false?'Đang tự động':'Đang tắt'}
          </span>
        </div>

        <form action={saveTrackingRuntimeSettings} className="tracking-runtime-grid-v7">
          <label className="settings-check">
            <input type="checkbox" name="auto_tracking_enabled" defaultChecked={runtime?.auto_tracking_enabled!==false} disabled={!canEdit}/>
            <span>Auto Tracking</span>
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
            <span>Retry khi lỗi</span>
            <input name="retry_minutes" defaultValue={(runtime?.retry_minutes??[10,30,60]).join(', ')} disabled={!canEdit}/>
          </label>
          {canEdit&&<button className="button primary" type="submit">Lưu</button>}
        </form>
      </section>

      <section className="tracking-source-panel-v7">
        <div className="tracking-source-main-v7">
          <div className="tracking-source-id-v7">
            <span className="carrier-code-badge spx">SPX</span>
            <div>
              <b>Nguồn Tracking</b>
              <span>{spxCarrier?.display_name||'SPX Express'} · SPX Direct</span>
            </div>
          </div>
          <div className="tracking-source-meta-v7">
            <span className={'tracking-source-state-v7 '+(spxProvider?.enabled?'on':'')}>
              {spxProvider?.enabled?'Đã kết nối':'Đang tắt'}
            </span>
            <span>GET</span>
            <span>10 giây timeout</span>
            <span>Không cần API key</span>
          </div>
        </div>

        {canEdit&&<form action={testTrackingConnection} className="tracking-source-test-v7">
          <input type="hidden" name="carrier" value="SPX"/>
          <input name="tracking_number" placeholder="Nhập MVD SPX để kiểm tra..." required/>
          <button className="button" type="submit">Test MVD</button>
        </form>}

        {canEdit&&advancedCarriers.length>0&&<details className="tracking-advanced-provider-v7">
          <summary>Cấu hình nguồn Tracking nâng cao ({advancedCarriers.length})</summary>
          <div className="provider-settings-list">
            {advancedCarriers.map(carrier=>{
              const code=carrier.carrier_code.toUpperCase()
              const row=providerMap.get(code)
              return <form action={saveTrackingProviderConfig} className="provider-settings-row provider-settings-row-v7" key={code}>
                <input type="hidden" name="carrier" value={code}/>
                <input type="hidden" name="adapter_type" value={row?.adapter_type??'NORMALIZED_JSON'}/>
                <div className="provider-name">
                  <b>{code} · {carrier.display_name}</b>
                  <span>Normalized JSON</span>
                </div>
                <label className="settings-field wide">
                  <span>Endpoint HTTPS</span>
                  <input name="endpoint_url" type="url" defaultValue={row?.endpoint_url??''} placeholder="https://provider.example/track"/>
                </label>
                <label className="settings-field compact">
                  <span>Method</span>
                  <select name="http_method" defaultValue={row?.http_method??'GET'}>
                    <option value="GET">GET</option><option value="POST">POST</option>
                  </select>
                </label>
                <label className="settings-field compact">
                  <span>Timeout</span>
                  <input name="timeout_ms" type="number" min="1000" max="30000" step="500" defaultValue={row?.timeout_ms??8000}/>
                </label>
                <label className="settings-check">
                  <input type="checkbox" name="enabled" defaultChecked={Boolean(row?.enabled)}/>
                  <span>Bật</span>
                </label>
                <button className="button small" type="submit">Lưu</button>
              </form>
            })}
          </div>
        </details>}
      </section>

      <section className="tracking-state-panel-v7">
        <div className="tracking-table-title-v7">
          <div>
            <h3>Chu kỳ theo trạng thái</h3>
            <p>Hiển thị đủ {sortedRules.length} trạng thái. Bảng có thanh cuộn riêng; header luôn cố định.</p>
          </div>
          <span>{sortedRules.filter(x=>!x.terminal&&x.auto_tracking).length} trạng thái Auto</span>
        </div>

        <div className="tracking-table-scroll-v7">
          <div className="tracking-rule-table-v7">
            <div className="tracking-rule-head-v7">
              <span>Trạng thái MYNH ERP</span>
              <span>Giai đoạn</span>
              <span>Auto</span>
              <span>Chu kỳ</span>
              <span>Hành vi</span>
              <span></span>
            </div>

            {sortedRules.map(rule=><form action={saveTrackingRule} className="tracking-rule-row-v7" key={rule.status_code}>
              <input type="hidden" name="status_code" value={rule.status_code}/>
              <div className="tracking-state-name-v7">
                <b>{rule.label}</b>
                <code>{rule.status_code}</code>
              </div>
              <span className="tracking-phase-v7">{PHASE_LABEL[rule.phase]??rule.phase}</span>
              {rule.terminal
                ? <span className="tracking-stop-v7">STOP</span>
                : <label className="tracking-toggle-v7">
                    <input type="checkbox" name="auto_tracking" defaultChecked={rule.auto_tracking} disabled={!canEdit}/>
                    <span>{rule.auto_tracking?'Bật':'Tắt'}</span>
                  </label>}
              {rule.terminal
                ? <span className="tracking-muted-v7">—</span>
                : <label className="tracking-cycle-input-v7">
                    <input name="interval_minutes" type="number" min="15" max="1440" step="5" defaultValue={rule.interval_minutes??120} disabled={!canEdit}/>
                    <span>phút</span>
                  </label>}
              <span className={'tracking-behavior-v7 '+(rule.terminal?'terminal':'')}>
                {rule.terminal?'Kết thúc':'Tiếp tục theo dõi'}
              </span>
              {canEdit&&!rule.terminal?<button className="button small" type="submit">Lưu</button>:<span/>}
            </form>)}
          </div>
        </div>
      </section>
    </div>}

    {tab==='mapping'&&<div className="settings-subtab-body-v6 tracking-mapping-body-v7">
      {unknownRaw.length>0&&<section className="tracking-unknown-panel-v7">
        <div className="tracking-table-title-v7">
          <div>
            <h3>Raw status chưa nhận diện</h3>
            <p>Chỉ xuất hiện khi SPX trả về mã mới chưa có mapping.</p>
          </div>
          <span>{unknownRaw.length} cần xử lý</span>
        </div>
        <div className="tracking-unknown-list-v7">
          {unknownRaw.map(row=><form action={saveCarrierStatusMapping} className="tracking-unknown-row-v7" key={row.carrier+'-'+row.raw_code}>
            <input type="hidden" name="carrier" value={row.carrier}/>
            <input type="hidden" name="raw_code" value={row.raw_code}/>
            <input type="hidden" name="raw_name" value={row.raw_name??''}/>
            <div className="tracking-state-name-v7">
              <b>{row.carrier} · {row.raw_code}</b>
              <span>{row.raw_name||row.description||'Raw status mới'} · {row.count} event</span>
            </div>
            <select name="canonical_status" defaultValue="UNKNOWN" disabled={!canEdit}>
              {canonicalOptions.map(x=><option value={x.status_code} key={x.status_code}>{x.label} · {x.status_code}</option>)}
            </select>
            <input type="hidden" name="is_active" value="on"/>
            {canEdit&&<button className="button small primary" type="submit">Tạo mapping</button>}
          </form>)}
        </div>
      </section>}

      <section className="tracking-mapping-panel-v7">
        <div className="tracking-table-title-v7">
          <div>
            <h3>Mapping trạng thái SPX → MYNH ERP</h3>
            <p>Mặc định ở chế độ đọc. Chỉ dòng đang sửa mới hiện form chỉnh sửa.</p>
          </div>
          <span>{mappings.length} mapping</span>
        </div>

        <div className="tracking-mapping-scroll-v7">
          <div className="tracking-mapping-table-v7">
            <div className="tracking-mapping-head-v7">
              <span>Raw code</span>
              <span>Trạng thái SPX</span>
              <span>Chuẩn hóa MYNH ERP</span>
              <span>Trạng thái</span>
              <span></span>
            </div>

            {mappings.map(row=>{
              const canonical=canonicalMap.get(row.canonical_status)
              const editing=editingMapping===row.id

              if(editing){
                return <form action={saveCarrierStatusMapping} className="tracking-mapping-row-v7 editing" key={row.id}>
                  <input type="hidden" name="carrier" value={row.carrier}/>
                  <input type="hidden" name="raw_code" value={row.raw_code}/>
                  <div className="tracking-raw-code-v7"><b>{row.carrier} · {row.raw_code}</b><small>{row.note||'—'}</small></div>
                  <input className="tracking-inline-input-v7" name="raw_name" defaultValue={row.raw_name??''}/>
                  <select className="tracking-inline-select-v7" name="canonical_status" defaultValue={row.canonical_status}>
                    {canonicalOptions.map(x=><option value={x.status_code} key={x.status_code}>{x.label} · {x.status_code}</option>)}
                  </select>
                  <label className="tracking-toggle-v7">
                    <input type="checkbox" name="is_active" defaultChecked={row.is_active}/>
                    <span>{row.is_active?'Bật':'Tắt'}</span>
                  </label>
                  <div className="tracking-mapping-actions-v7">
                    <button className="button small primary" type="submit">Lưu</button>
                    <button className="button small" type="button" onClick={()=>setEditingMapping(null)}>Huỷ</button>
                  </div>
                </form>
              }

              return <div className="tracking-mapping-row-v7" key={row.id}>
                <div className="tracking-raw-code-v7">
                  <b>{row.carrier} · {row.raw_code}</b>
                  <small>{row.note||'—'}</small>
                </div>
                <div className="tracking-raw-name-v7">{row.raw_name||'—'}</div>
                <div className="tracking-canonical-v7">
                  <b>{canonical?.label||row.canonical_status}</b>
                  <code>{row.canonical_status}</code>
                </div>
                <span className={'tracking-active-chip-v7 '+(row.is_active?'on':'')}>{row.is_active?'Đang bật':'Tạm tắt'}</span>
                <div className="tracking-mapping-actions-v7">
                  {canEdit&&<button className="button small" type="button" onClick={()=>setEditingMapping(row.id)}>Sửa</button>}
                </div>
              </div>
            })}
          </div>
        </div>
      </section>

      <div className="settings-inline-note tracking-mapping-note-v7">
        <b>Nguyên tắc:</b> Raw code từ SPX được chuẩn hóa sang một trạng thái MYNH ERP. Riêng <code>F599</code> chỉ thành “Đến kho đích” khi location khớp HUB/alias trong <Link href="/settings?section=shipping&shipping_tab=hubs">Cấu hình vận chuyển → Kho đích</Link>.
      </div>
    </div>}
  </div>
}
