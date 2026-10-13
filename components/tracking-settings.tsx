'use client'

import { useEffect,useMemo,useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  saveCarrierStatusMapping,
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
type Tab='operation'|'cycle'|'mapping'

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
  mappings,
  unknownRaw,
  canEdit,
  trackingTest,
  trackingMessage,
  initialTab='operation',
  mapped=false,
}:{
  runtime:RuntimeSettings|null
  rules:Rule[]
  mappings:Mapping[]
  unknownRaw:UnknownRaw[]
  canEdit:boolean
  trackingTest?:string|null
  trackingMessage?:string|null
  initialTab?:Tab
  mapped?:boolean
}){
  // Broadcast only after Supabase accepts the Auto Tracking setting.
  async function saveRuntimeAndNotify(formData:FormData){
    await saveTrackingRuntimeSettings(formData)
    const enabled=formData.get('auto_tracking_enabled')==='on'
    const quietStart=String(formData.get('quiet_start')??'02:00').slice(0,5)
    const quietEnd=String(formData.get('quiet_end')??'06:00').slice(0,5)
    const runtime={enabled,quietStart,quietEnd}
    // One atomic cross-tab event prevents a transient request during newly configured quiet hours.
    try{window.localStorage.setItem('mynh-erp-tracking-runtime',JSON.stringify(runtime))}
    catch{/* Same-tab event still works if storage is blocked. */}
    window.dispatchEvent(new CustomEvent('mynh-erp-tracking-changed',{detail:runtime}))
  }

  const router=useRouter()
  const [tab,setTab]=useState<Tab>(initialTab)
  const [mappingSaving,setMappingSaving]=useState(false)
  const [mappingFeedback,setMappingFeedback]=useState<{success:boolean;message:string}|null>(null)
  function changeTab(nextTab:Tab){
    setTab(nextTab)
    if(nextTab==='mapping')setMappingExpanded(true)
    // Same-origin history only: preserve the active subtab across refresh/reload
    // without navigating to a different Worker or reloading the page.
    const url=new URL(window.location.href)
    if(url.pathname==='/settings'&&url.searchParams.get('section')==='tracking'){
      url.searchParams.set('tracking_tab',nextTab)
      url.searchParams.delete('mapped')
      window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
    }
  }
  async function submitMapping(formData:FormData){
    if(!canEdit)return
    setMappingSaving(true)
    setMappingFeedback(null)
    try{
      const result=await saveCarrierStatusMapping(formData)
      setEditingMapping(null)
      changeTab('mapping')
      setMappingFeedback({success:true,message:'Đã lưu mapping. Đã phân loại lại '+result.updatedEvents+' sự kiện lịch sử UNKNOWN phù hợp.'})
      router.refresh()
    }catch(error){
      setMappingFeedback({success:false,message:'Không lưu được mapping: '+(error instanceof Error?error.message:'Có lỗi xảy ra')})
    }finally{
      setMappingSaving(false)
    }
  }
  const [editingMapping,setEditingMapping]=useState<string|null>(null)
  // Keep the pending-provider codes visible; open the mapping catalogue on demand.
  const [unknownExpanded,setUnknownExpanded]=useState(true)
  const [mappingExpanded,setMappingExpanded]=useState(initialTab==='mapping')
  useEffect(()=>{
    setTab(initialTab)
    if(initialTab==='mapping')setMappingExpanded(true)
  },[initialTab])
  useEffect(()=>{
    if(tab!=='mapping')return
    document.getElementById('tracking-mapping-content-v9')?.scrollIntoView({behavior:'smooth',block:'start'})
  },[tab])

  const canonicalOptions=rules.filter(x=>x.is_active)
  const canonicalMap=useMemo(()=>new Map(rules.map(x=>[x.status_code,x])),[rules])
  const sortedRules=[...rules].sort((a,b)=>a.sort_order-b.sort_order)
  const autoStatusCount=sortedRules.filter(x=>!x.terminal&&x.auto_tracking).length

  return <div className="tracking-settings tracking-settings-v9">
    {mappingFeedback&&<div role="status" className={'settings-result '+(mappingFeedback.success?'success':'error')}>{mappingFeedback.message}</div>}
    {mapped&&<div className="settings-result success">Đã lưu mapping. Các sự kiện lịch sử chưa tự động được phân loại lại.</div>}
    {trackingTest==='ok'&&<div className="settings-result success">Tracking test thành công: {trackingMessage}</div>}
    {trackingTest==='fail'&&<div className="settings-result error">Tracking test thất bại: {trackingMessage||'Không xác định'}</div>}

    <div className="destination-detail-tabs settings-subtabs-v6 tracking-subtabs-v9">
      <button type="button" className={tab==='operation'?'active':''} onClick={()=>changeTab('operation')}>
        Vận hành Tracking
      </button>
      <button type="button" className={tab==='cycle'?'active':''} onClick={()=>changeTab('cycle')}>
        Chu kỳ trạng thái <span>{sortedRules.length}</span>
      </button>
      <button type="button" className={tab==='mapping'?'active':''} onClick={()=>changeTab('mapping')}>
        Mapping SPX <span>{mappings.length}</span>
      </button>
    </div>

    {tab==='operation'&&<div className="settings-subtab-body-v6 tracking-operation-body-v9">
      <section className="tracking-runtime-panel-v7">
        <div className="tracking-runtime-head-v7">
          <div>
            <h3>Quy tắc vận hành</h3>
            <p>Điều khiển Auto Tracking, giờ nghỉ và lịch retry khi provider lỗi.</p>
          </div>
          <span className={'tracking-engine-state-v7 '+(runtime?.auto_tracking_enabled!==false?'on':'')}>
            {runtime?.auto_tracking_enabled!==false?'Đang tự động':'Đang tắt'}
          </span>
        </div>

        <form action={saveRuntimeAndNotify} className="tracking-runtime-grid-v7">
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

      <section className="tracking-internal-panel-v10">
        <div className="tracking-internal-copy-v10">
          <div>
            <h3>Tracking nội bộ</h3>
            <p>MYNH ERP tự xử lý lịch quét, chuẩn hóa trạng thái và lưu hành trình. Không cần chọn nguồn Tracking tại màn vận hành.</p>
          </div>
          <span className="tracking-internal-state-v10">Đã kết nối hệ thống</span>
        </div>

        {canEdit&&<form action={testTrackingConnection} className="tracking-internal-test-v10">
          <input type="hidden" name="carrier" value="SPX"/>
          <label className="settings-field">
            <span>Kiểm tra đồng bộ bằng MVD</span>
            <input name="tracking_number" placeholder="Nhập MVD SPX..." required/>
          </label>
          <button className="button" type="submit">Kiểm tra Tracking</button>
        </form>}
      </section>

      <div className="tracking-operation-note-v9">
        <b>Luồng nội bộ:</b>
        <span>Cron → Tracking Engine → chuẩn hóa trạng thái → cập nhật shipment → tạo Alert khi trạng thái thay đổi.</span>
      </div>
    </div>}

    {tab==='cycle'&&<div className="settings-subtab-body-v6 tracking-cycle-body-v9">
      <section className="tracking-state-panel-v7 tracking-full-panel-v9">
        <div className="tracking-table-title-v7">
          <div>
            <h3>Chu kỳ trạng thái</h3>
            <p>Toàn bộ {sortedRules.length} trạng thái Tracking. Header cố định; cuộn trong bảng, không kéo cả trang.</p>
          </div>
          <span>{autoStatusCount} trạng thái Auto</span>
        </div>

        <div className="tracking-table-scroll-v7 tracking-table-scroll-full-v9">
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

    {tab==='mapping'&&<div className="settings-subtab-body-v6 tracking-mapping-body-v9">
      {unknownRaw.length>0&&<section className={'tracking-unknown-panel-v7 tracking-collapsible-panel-v9 '+(unknownExpanded?'is-expanded':'is-collapsed')}>
        <div className="tracking-table-title-v7">
          <div>
            <h3>Raw status chưa nhận diện</h3>
            <p>Chọn trạng thái chính xác rồi tạo Mapping; hệ thống sẽ cập nhật cả các sự kiện lịch sử UNKNOWN cùng mã.</p>
          </div>
          <div className="tracking-section-actions-v9">
            <span className="tracking-section-count-v9">{unknownRaw.length} cần xử lý</span>
            <button type="button" className="tracking-section-toggle-v9"
              aria-expanded={unknownExpanded} aria-controls="tracking-unknown-content-v9"
              onClick={()=>setUnknownExpanded(v=>!v)}>
              <span aria-hidden="true" className="tracking-section-chevron-v9">{unknownExpanded?'⌃':'⌄'}</span>
              {unknownExpanded?'Thu gọn':'Mở rộng'}
            </button>
          </div>
        </div>
        <div id="tracking-unknown-content-v9" className="tracking-unknown-list-v7" aria-hidden={!unknownExpanded}>
          {unknownRaw.map(row=><form action={submitMapping} className="tracking-unknown-row-v7" key={row.carrier+'-'+row.raw_code}>
            <input type="hidden" name="carrier" value={row.carrier}/>
            <input type="hidden" name="raw_code" value={row.raw_code}/>
            <input type="hidden" name="raw_name" value={row.raw_name??''}/>
            <div className="tracking-state-name-v7">
              <b>{row.carrier} · {row.raw_code}</b>
              <span>{row.raw_name||row.description||'Raw status mới'} · {row.count} event</span>
            </div>
            <select name="canonical_status" defaultValue="" required disabled={!canEdit}>
              <option value="" disabled>Chọn trạng thái MYNH ERP…</option>
              {canonicalOptions.filter(x=>x.status_code!=='UNKNOWN').map(x=><option value={x.status_code} key={x.status_code}>{x.label} · {x.status_code}</option>)}
            </select>
            <input type="hidden" name="is_active" value="on"/>
            {canEdit&&<button className="button small primary" type="submit" disabled={mappingSaving}>{mappingSaving?'Đang lưu…':'Tạo mapping'}</button>}
          </form>)}
        </div>
      </section>}

      <section className={'tracking-mapping-panel-v7 tracking-full-panel-v9 tracking-collapsible-panel-v9 '+(mappingExpanded?'is-expanded':'is-collapsed')}>
        <div className="tracking-table-title-v7">
          <div>
            <h3>Mapping SPX → MYNH ERP</h3>
            <p>Chỉ dòng bấm Sửa mới cho thay đổi. Khi lưu sẽ phân loại lại sự kiện lịch sử UNKNOWN khớp mã; không đổi trạng thái vận đơn. Riêng F599 giữ quy tắc HUB.</p>
          </div>
          <div className="tracking-section-actions-v9">
            <span className="tracking-section-count-v9">{mappings.length} mapping</span>
            <button type="button" className="tracking-section-toggle-v9"
              aria-expanded={mappingExpanded} aria-controls="tracking-mapping-content-v9"
              onClick={()=>setMappingExpanded(v=>!v)}>
              <span aria-hidden="true" className="tracking-section-chevron-v9">{mappingExpanded?'⌃':'⌄'}</span>
              {mappingExpanded?'Thu gọn':'Mở rộng'}
            </button>
          </div>
        </div>

        <div id="tracking-mapping-content-v9" className="tracking-mapping-scroll-v7 tracking-mapping-scroll-full-v9" aria-hidden={!mappingExpanded}>
          <div className="tracking-mapping-table-v7">
            <div className="tracking-mapping-head-v7">
              <span>Raw code</span>
              <span>Trạng thái SPX</span>
              <span>Trạng thái MYNH ERP</span>
              <span>Trạng thái</span>
              <span></span>
            </div>

            {mappings.map(row=>{
              const canonical=canonicalMap.get(row.canonical_status)
              const editing=editingMapping===row.id

              if(editing){
                return <form action={submitMapping} className="tracking-mapping-row-v7 editing" key={row.id}>
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
                    <button className="button small primary" type="submit" disabled={mappingSaving}>{mappingSaving?'Đang lưu…':'Lưu'}</button>
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
        <b>Nguyên tắc:</b> Raw code SPX được chuẩn hóa về một trạng thái MYNH ERP. Riêng <code>F599</code> chỉ là “Đến kho đích” khi location khớp HUB/alias trong <Link href="/settings?section=shipping&shipping_tab=hubs">Cấu hình vận chuyển → Kho đích</Link>.
      </div>
    </div>}
  </div>
}
