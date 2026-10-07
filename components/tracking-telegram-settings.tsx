'use client'

import { useState } from 'react'
import {
  deleteTelegramAlertDestination,
  saveAlertRuleConfig,
  saveTelegramAlertDestination,
  saveTelegramAlertSettings,
  testTelegramConnection,
} from '@/lib/actions/core'

type TelegramSettings={
  enabled:boolean
  default_chat_id?:string|null
  bot_token_secret_id?:string|null
  retry_minutes?:number[]|null
  max_attempts?:number|null
  enabled_at?:string|null
}
type Destination={
  id:string
  destination_hub:string
  chat_id:string
  alert_types?:string[]|null
  is_active:boolean
}
type AlertRule={
  alert_type:string
  label:string
  enabled:boolean
  in_app_enabled:boolean
  telegram_enabled:boolean
  batch_window_minutes:number
  sort_order:number
}
type Tab='rules'|'telegram'|'routing'

const ALERTS=[
  ['PICKUP_FAILED','Lấy hàng không thành công'],
  ['ARRIVED_DESTINATION_HUB','Đến kho đích'],
  ['OUT_FOR_DELIVERY','Đang giao'],
  ['DELIVERY_FAILED','Giao không thành công'],
  ['DELIVERED','Giao thành công'],
] as const

export function TrackingTelegramSettings({
  telegram,
  rules,
  destinations,
  hubs,
  canEdit,
  telegramTest,
  telegramMessage,
}:{
  telegram:TelegramSettings|null
  rules:AlertRule[]
  destinations:Destination[]
  hubs:string[]
  canEdit:boolean
  telegramTest?:string|null
  telegramMessage?:string|null
}){
  const [tab,setTab]=useState<Tab>('rules')
  const sortedRules=[...rules].sort((a,b)=>a.sort_order-b.sort_order)
  const enabledRules=sortedRules.filter(x=>x.enabled).length
  const inAppRules=sortedRules.filter(x=>x.enabled&&x.in_app_enabled).length
  const telegramRules=sortedRules.filter(x=>x.enabled&&x.telegram_enabled).length

  return <div className="tracking-telegram-settings notification-settings-v6">
    {telegramTest==='ok'&&<div className="settings-result success">Telegram test: gửi thành công.</div>}
    {telegramTest==='fail'&&<div className="settings-result error">Telegram test thất bại: {telegramMessage||'Không xác định'}</div>}

    <div className="destination-detail-tabs settings-subtabs-v6">
      <button type="button" className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>
        Quy tắc <span>{enabledRules}</span>
      </button>
      <button type="button" className={tab==='telegram'?'active':''} onClick={()=>setTab('telegram')}>
        Telegram <span>{telegram?.enabled?'ON':'OFF'}</span>
      </button>
      <button type="button" className={tab==='routing'?'active':''} onClick={()=>setTab('routing')}>
        Routing HUB <span>{destinations.filter(x=>x.is_active).length}</span>
      </button>
    </div>

    {tab==='rules'&&<div className="settings-subtab-body-v6">
      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">THÔNG BÁO VẬN CHUYỂN</span>
            <h3>Quy tắc cảnh báo</h3>
            <p>Tracking sinh transition; Thông báo quyết định có tạo Alert, hiển thị In-app và gửi Telegram hay không.</p>
          </div>
          <span className="settings-mini-status">{enabledRules}/5 Alert · {inAppRules} In-app · {telegramRules} Telegram</span>
        </div>

        <div className="notification-rule-table-v6">
          <div className="notification-rule-head-v6">
            <span>Cảnh báo</span><span>Alert</span><span>In-app</span><span>Telegram</span><span>Gom</span><span></span>
          </div>
          {sortedRules.map(rule=><form action={saveAlertRuleConfig} className="notification-rule-row-v6" key={rule.alert_type}>
            <input type="hidden" name="alert_type" value={rule.alert_type}/>
            <div className="tracking-status-cell-v6">
              <b>{rule.label}</b>
              <code>{rule.alert_type}</code>
            </div>
            <label className="settings-check compact-check-v6">
              <input type="checkbox" name="enabled" defaultChecked={rule.enabled} disabled={!canEdit}/>
              <span>{rule.enabled?'Bật':'Tắt'}</span>
            </label>
            <label className="settings-check compact-check-v6">
              <input type="checkbox" name="in_app_enabled" defaultChecked={rule.in_app_enabled} disabled={!canEdit}/>
              <span>{rule.in_app_enabled?'Bật':'Tắt'}</span>
            </label>
            <label className="settings-check compact-check-v6">
              <input type="checkbox" name="telegram_enabled" defaultChecked={rule.telegram_enabled} disabled={!canEdit}/>
              <span>{rule.telegram_enabled?'Bật':'Tắt'}</span>
            </label>
            <label className="tracking-cycle-input-v6">
              <input name="batch_window_minutes" type="number" min="0" max="60" step="1" defaultValue={rule.batch_window_minutes} disabled={!canEdit}/>
              <span>phút</span>
            </label>
            {canEdit?<button className="button small" type="submit">Lưu</button>:<span/>}
          </form>)}
        </div>

        <div className="settings-inline-note">
          <b>In-app và Telegram là hai kênh độc lập.</b> Telegram lỗi/tắt không làm mất Alert trong ứng dụng. Cửa sổ gom 0–60 phút áp dụng theo HUB + loại cảnh báo.
        </div>
      </section>
    </div>}

    {tab==='telegram'&&<div className="settings-subtab-body-v6">
      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">TELEGRAM DELIVERY</span>
            <h3>Bot & chính sách gửi</h3>
            <p>Token lưu trong Supabase Vault; Chat ID mặc định dùng khi HUB chưa có route riêng.</p>
          </div>
          <span className={'settings-mini-status '+(telegram?.enabled?'on':'')}>
            {telegram?.enabled?'Đang gửi':telegram?.bot_token_secret_id?'Sẵn sàng bật':'Thiếu Bot Token'}
          </span>
        </div>

        <form action={saveTelegramAlertSettings} className="telegram-settings-grid-v6">
          <label className="settings-field">
            <span>Bot Token</span>
            <input
              name="bot_token"
              type="password"
              placeholder={telegram?.bot_token_secret_id?'Đã lưu trong Vault · nhập để thay':'Nhập token từ BotFather'}
              disabled={!canEdit}
            />
          </label>
          <label className="settings-field">
            <span>Chat ID mặc định</span>
            <input name="default_chat_id" defaultValue={telegram?.default_chat_id??''} placeholder="-100..." disabled={!canEdit}/>
          </label>
          <label className="settings-field">
            <span>Retry khi gửi lỗi (phút)</span>
            <input name="retry_minutes" defaultValue={(telegram?.retry_minutes??[5,15,30,60]).join(', ')} placeholder="5, 15, 30, 60" disabled={!canEdit}/>
          </label>
          <label className="settings-field">
            <span>Tối đa số lần thử</span>
            <input name="max_attempts" type="number" min="1" max="20" defaultValue={telegram?.max_attempts??5} disabled={!canEdit}/>
          </label>
          <div className="telegram-settings-actions-v6">
            <label className="settings-check">
              <input type="checkbox" name="enabled" defaultChecked={Boolean(telegram?.enabled)} disabled={!canEdit}/>
              <span>Bật gửi Telegram</span>
            </label>
            {canEdit&&telegram?.bot_token_secret_id&&<label className="settings-check subtle">
              <input type="checkbox" name="clear_token"/>
              <span>Xóa Bot Token</span>
            </label>}
            {canEdit&&<button className="button primary" type="submit">Lưu Telegram</button>}
          </div>
        </form>

        {canEdit&&<form action={testTelegramConnection} className="telegram-test-form telegram-test-form-v6">
          <label className="settings-field">
            <span>Chat ID test</span>
            <input name="chat_id" placeholder={telegram?.default_chat_id??'-100...'}/>
          </label>
          <button className="button" type="submit">Kiểm tra kết nối</button>
        </form>}

        <div className="notification-delivery-info-v6">
          <div><span>Alert dùng Telegram</span><b>{telegramRules} / 5</b></div>
          <div><span>Retry</span><b>{(telegram?.retry_minutes??[5,15,30,60]).join(' → ')} phút</b></div>
          <div><span>Tối đa</span><b>{telegram?.max_attempts??5} lần</b></div>
          <div><span>Chat mặc định</span><b>{telegram?.default_chat_id||'Chưa cấu hình'}</b></div>
        </div>
      </section>
    </div>}

    {tab==='routing'&&<div className="settings-subtab-body-v6">
      <section className="settings-block settings-flat-block">
        <div className="settings-block-head">
          <div>
            <span className="module-eyebrow">ROUTING THEO HUB</span>
            <h3>Nhóm Telegram theo HUB</h3>
            <p>Mỗi HUB có thể dùng Chat ID và tập loại cảnh báo riêng; nếu không có thì dùng Chat ID mặc định.</p>
          </div>
          <span className="settings-mini-status">{destinations.filter(x=>x.is_active).length} route hoạt động</span>
        </div>

        <div className="telegram-destinations telegram-destinations-v6">
          {destinations.map(row=><form action={saveTelegramAlertDestination} className="telegram-destination-row telegram-destination-row-v6" key={row.id}>
            <input type="hidden" name="destination_id" value={row.id}/>
            <label className="settings-field">
              <span>HUB</span>
              <input name="destination_hub" defaultValue={row.destination_hub} readOnly/>
            </label>
            <label className="settings-field">
              <span>Chat ID</span>
              <input name="chat_id" defaultValue={row.chat_id} disabled={!canEdit}/>
            </label>
            <div className="telegram-alert-types compact">
              {ALERTS.map(([value,label])=><label className="settings-check" key={value}>
                <input type="checkbox" name="alert_types" value={value} defaultChecked={!row.alert_types?.length||row.alert_types.includes(value)} disabled={!canEdit}/>
                <span>{label}</span>
              </label>)}
            </div>
            <label className="settings-check">
              <input type="checkbox" name="is_active" defaultChecked={row.is_active} disabled={!canEdit}/>
              <span>{row.is_active?'Đang bật':'Tạm tắt'}</span>
            </label>
            {canEdit&&<div className="provider-row-actions">
              <button className="button small primary" type="submit">Lưu</button>
              <button className="button small danger" type="submit" formAction={deleteTelegramAlertDestination}>Xóa</button>
            </div>}
          </form>)}

          {canEdit&&<form action={saveTelegramAlertDestination} className="telegram-destination-row telegram-destination-row-v6 new">
            <label className="settings-field">
              <span>HUB mới</span>
              {hubs.length
                ? <select name="destination_hub" defaultValue="">
                    <option value="" disabled>Chọn HUB</option>
                    {hubs.map(h=><option key={h} value={h}>{h}</option>)}
                  </select>
                : <input name="destination_hub" placeholder="Tạo HUB trước trong Cấu hình vận chuyển" required/>}
            </label>
            <label className="settings-field">
              <span>Chat ID</span>
              <input name="chat_id" placeholder="-100..." required/>
            </label>
            <div className="telegram-alert-types compact">
              {ALERTS.map(([value,label])=><label className="settings-check" key={value}>
                <input type="checkbox" name="alert_types" value={value} defaultChecked/>
                <span>{label}</span>
              </label>)}
            </div>
            <label className="settings-check">
              <input type="checkbox" name="is_active" defaultChecked/>
              <span>Bật</span>
            </label>
            <button className="button small primary" type="submit">+ Thêm route</button>
          </form>}
        </div>
      </section>
    </div>}
  </div>
}
