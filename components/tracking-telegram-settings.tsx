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
type Tab='rules'|'telegram'|'groups'

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
  const activeGroups=destinations.filter(x=>x.is_active).length

  return <div className="tracking-telegram-settings notification-settings-v9">
    {telegramTest==='ok'&&<div className="settings-result success">Telegram test: gửi thành công.</div>}
    {telegramTest==='fail'&&<div className="settings-result error">Telegram test thất bại: {telegramMessage||'Không xác định'}</div>}

    <div className="destination-detail-tabs settings-subtabs-v6 notification-subtabs-v9">
      <button type="button" className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>
        Quy tắc thông báo <span>{enabledRules}</span>
      </button>
      <button type="button" className={tab==='telegram'?'active':''} onClick={()=>setTab('telegram')}>
        Kết nối Telegram <span>{telegram?.enabled?'ON':'OFF'}</span>
      </button>
      <button type="button" className={tab==='groups'?'active':''} onClick={()=>setTab('groups')}>
        Nhóm theo HUB <span>{activeGroups}</span>
      </button>
    </div>

    {tab==='rules'&&<div className="settings-subtab-body-v6 notification-rules-body-v9">
      <section className="notification-full-panel-v9">
        <div className="notification-panel-head-v9">
          <div>
            <h3>Quy tắc thông báo vận chuyển</h3>
            <p>Mỗi trạng thái quyết định có tạo Alert, hiện In-app và gửi Telegram hay không.</p>
          </div>
          <span>{enabledRules}/5 Alert · {inAppRules} In-app · {telegramRules} Telegram</span>
        </div>

        <div className="notification-rule-scroll-v9">
          <div className="notification-rule-table-v9">
            <div className="notification-rule-head-v9">
              <span>Cảnh báo</span>
              <span>Alert</span>
              <span>In-app</span>
              <span>Telegram</span>
              <span>Gom</span>
              <span></span>
            </div>

            {sortedRules.map(rule=><form action={saveAlertRuleConfig} className="notification-rule-row-v9" key={rule.alert_type}>
              <input type="hidden" name="alert_type" value={rule.alert_type}/>
              <div className="notification-rule-name-v9">
                <b>{rule.label}</b>
                <code>{rule.alert_type}</code>
              </div>
              <label className="notification-toggle-v9">
                <input type="checkbox" name="enabled" defaultChecked={rule.enabled} disabled={!canEdit}/>
                <span>{rule.enabled?'Bật':'Tắt'}</span>
              </label>
              <label className="notification-toggle-v9">
                <input type="checkbox" name="in_app_enabled" defaultChecked={rule.in_app_enabled} disabled={!canEdit}/>
                <span>{rule.in_app_enabled?'Bật':'Tắt'}</span>
              </label>
              <label className="notification-toggle-v9">
                <input type="checkbox" name="telegram_enabled" defaultChecked={rule.telegram_enabled} disabled={!canEdit}/>
                <span>{rule.telegram_enabled?'Bật':'Tắt'}</span>
              </label>
              <label className="notification-batch-v9">
                <input name="batch_window_minutes" type="number" min="0" max="60" step="1" defaultValue={rule.batch_window_minutes} disabled={!canEdit}/>
                <span>phút</span>
              </label>
              {canEdit?<button className="button small" type="submit">Lưu</button>:<span/>}
            </form>)}
          </div>
        </div>

        <div className="notification-footnote-v9">
          <b>In-app và Telegram độc lập.</b>
          <span>Telegram lỗi hoặc tắt không làm mất thông báo trong ứng dụng. Thời gian gom áp dụng theo HUB + loại cảnh báo.</span>
        </div>
      </section>
    </div>}

    {tab==='telegram'&&<div className="settings-subtab-body-v6 notification-telegram-body-v9">
      <section className="notification-full-panel-v9">
        <div className="notification-panel-head-v9">
          <div>
            <h3>Kết nối Telegram</h3>
            <p>Bot Token lưu trong Vault; Chat ID mặc định dùng khi HUB chưa có nhóm riêng.</p>
          </div>
          <span className={telegram?.enabled?'ok':'warn'}>
            {telegram?.enabled?'Đang gửi':telegram?.bot_token_secret_id?'Sẵn sàng bật':'Thiếu Bot Token'}
          </span>
        </div>

        <form action={saveTelegramAlertSettings} className="telegram-settings-grid-v9">
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
            <span>Retry khi gửi lỗi</span>
            <input name="retry_minutes" defaultValue={(telegram?.retry_minutes??[5,15,30,60]).join(', ')} placeholder="5, 15, 30, 60" disabled={!canEdit}/>
          </label>
          <label className="settings-field">
            <span>Tối đa số lần thử</span>
            <input name="max_attempts" type="number" min="1" max="20" defaultValue={telegram?.max_attempts??5} disabled={!canEdit}/>
          </label>

          <div className="telegram-settings-actions-v9">
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

        {canEdit&&<form action={testTelegramConnection} className="telegram-test-form-v9">
          <label className="settings-field">
            <span>Chat ID test</span>
            <input name="chat_id" placeholder={telegram?.default_chat_id??'-100...'}/>
          </label>
          <button className="button" type="submit">Kiểm tra kết nối</button>
        </form>}

        <div className="telegram-info-grid-v9">
          <div><span>Loại gửi Telegram</span><b>{telegramRules} / 5</b></div>
          <div><span>Retry</span><b>{(telegram?.retry_minutes??[5,15,30,60]).join(' → ')} phút</b></div>
          <div><span>Tối đa</span><b>{telegram?.max_attempts??5} lần</b></div>
          <div><span>Chat mặc định</span><b>{telegram?.default_chat_id||'Chưa cấu hình'}</b></div>
        </div>
      </section>
    </div>}

    {tab==='groups'&&<div className="settings-subtab-body-v6 notification-groups-body-v9">
      <section className="notification-full-panel-v9">
        <div className="notification-panel-head-v9">
          <div>
            <h3>Nhóm thông báo theo HUB</h3>
            <p>HUB có thể dùng Chat ID và nhóm loại cảnh báo riêng; không cấu hình sẽ dùng Chat ID mặc định.</p>
          </div>
          <span>{activeGroups} nhóm hoạt động</span>
        </div>

        <div className="notification-group-scroll-v9">
          <div className="notification-group-table-v9">
            <div className="notification-group-head-v9">
              <span>HUB</span>
              <span>Chat ID</span>
              <span>Loại thông báo</span>
              <span>Trạng thái</span>
              <span></span>
            </div>

            {destinations.map(row=><form action={saveTelegramAlertDestination} className="notification-group-row-v9" key={row.id}>
              <input type="hidden" name="destination_id" value={row.id}/>
              <input className="notification-group-input-v9" name="destination_hub" defaultValue={row.destination_hub} readOnly/>
              <input className="notification-group-input-v9" name="chat_id" defaultValue={row.chat_id} disabled={!canEdit}/>
              <div className="notification-alert-list-v9">
                {ALERTS.map(([value,label])=><label key={value}>
                  <input type="checkbox" name="alert_types" value={value} defaultChecked={!row.alert_types?.length||row.alert_types.includes(value)} disabled={!canEdit}/>
                  <span>{label}</span>
                </label>)}
              </div>
              <label className="notification-toggle-v9">
                <input type="checkbox" name="is_active" defaultChecked={row.is_active} disabled={!canEdit}/>
                <span>{row.is_active?'Đang bật':'Tạm tắt'}</span>
              </label>
              {canEdit&&<div className="notification-group-actions-v9">
                <button className="button small primary" type="submit">Lưu</button>
                <button className="button small danger" type="submit" formAction={deleteTelegramAlertDestination}>Xóa</button>
              </div>}
            </form>)}

            {canEdit&&<form action={saveTelegramAlertDestination} className="notification-group-row-v9 new">
              {hubs.length
                ? <select className="notification-group-input-v9" name="destination_hub" defaultValue="" required>
                    <option value="" disabled>Chọn HUB</option>
                    {hubs.map(h=><option key={h} value={h}>{h}</option>)}
                  </select>
                : <input className="notification-group-input-v9" name="destination_hub" placeholder="Tạo HUB trước trong Cấu hình vận chuyển" required/>}
              <input className="notification-group-input-v9" name="chat_id" placeholder="-100..." required/>
              <div className="notification-alert-list-v9">
                {ALERTS.map(([value,label])=><label key={value}>
                  <input type="checkbox" name="alert_types" value={value} defaultChecked/>
                  <span>{label}</span>
                </label>)}
              </div>
              <label className="notification-toggle-v9">
                <input type="checkbox" name="is_active" defaultChecked/>
                <span>Bật</span>
              </label>
              <button className="button small primary" type="submit">+ Thêm nhóm</button>
            </form>}
          </div>
        </div>
      </section>
    </div>}
  </div>
}
