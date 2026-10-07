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

const ALERTS=[
  ['PICKUP_FAILED','Lấy hàng không thành công'],
  ['ARRIVED_DESTINATION_HUB','Đến kho đích'],
  ['OUT_FOR_DELIVERY','Đang giao'],
  ['DELIVERED','Giao thành công'],
  ['DELIVERY_FAILED','Giao không thành công'],
] as const

export function TrackingTelegramSettings({
  telegram,
  rules,
  destinations,
  hubs,
  canEdit,
  telegramTest,
  telegramMessage,
  view='all',
}:{
  telegram:TelegramSettings|null
  rules:AlertRule[]
  destinations:Destination[]
  hubs:string[]
  canEdit:boolean
  telegramTest?:string|null
  telegramMessage?:string|null
  view?:'all'|'alerts'|'telegram'
}){
  const sortedRules=[...rules].sort((a,b)=>a.sort_order-b.sort_order)
  const showAlerts=view!=='telegram'
  const showTelegram=view!=='alerts'

  return <div className="tracking-telegram-settings">
    {showTelegram&&telegramTest==='ok'&&<div className="settings-result success">Telegram test: gửi thành công.</div>}
    {showTelegram&&telegramTest==='fail'&&<div className="settings-result error">Telegram test thất bại: {telegramMessage||'Không xác định'}</div>}

    {showAlerts&&<section className="settings-block settings-flat-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">ALERT RULES</span>
          <h3>Quy tắc cảnh báo vận chuyển</h3>
          <p>Mỗi trạng thái có thể bật độc lập cho In-app và Telegram; thời gian gom dùng chung để chống spam.</p>
        </div>
      </div>

      <div className="settings-table-v5">
        <div className="settings-table-head alerts-rule-grid-v5">
          <span>Cảnh báo</span>
          <span>Bật Alert</span>
          <span>In-app</span>
          <span>Telegram</span>
          <span>Gom</span>
          <span></span>
        </div>
        {sortedRules.map(rule=><form action={saveAlertRuleConfig} className="settings-table-row alerts-rule-grid-v5" key={rule.alert_type}>
          <input type="hidden" name="alert_type" value={rule.alert_type}/>
          <div className="provider-name">
            <b>{rule.label}</b>
            <span>{rule.alert_type}</span>
          </div>
          <label className="settings-check compact-check">
            <input type="checkbox" name="enabled" defaultChecked={rule.enabled} disabled={!canEdit}/>
            <span>Alert</span>
          </label>
          <label className="settings-check compact-check">
            <input type="checkbox" name="in_app_enabled" defaultChecked={rule.in_app_enabled} disabled={!canEdit}/>
            <span>In-app</span>
          </label>
          <label className="settings-check compact-check">
            <input type="checkbox" name="telegram_enabled" defaultChecked={rule.telegram_enabled} disabled={!canEdit}/>
            <span>Telegram</span>
          </label>
          <label className="settings-field inline-field-v5">
            <input
              type="number"
              name="batch_window_minutes"
              min="0"
              max="60"
              step="1"
              defaultValue={rule.batch_window_minutes}
              disabled={!canEdit}
            />
            <span>phút</span>
          </label>
          {canEdit?<button className="button small" type="submit">Lưu</button>:<span/>}
        </form>)}
      </div>

      <div className="settings-inline-note">
        <b>Hai kênh độc lập.</b> Tắt Telegram không làm mất thông báo In-app. Đặt thời gian gom 0 phút nếu muốn xử lý ngay.
      </div>
    </section>}

    {showTelegram&&<section className="settings-block settings-flat-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">TELEGRAM</span>
          <h3>Bot & chính sách gửi</h3>
          <p>Bot Token lưu trong Supabase Vault. Chat ID mặc định dùng khi HUB chưa có routing riêng.</p>
        </div>
        <span className={'settings-mini-status '+(telegram?.enabled?'on':'')}>
          {telegram?.enabled?'Đang gửi':telegram?.bot_token_secret_id?'Sẵn sàng bật':'Thiếu Bot Token'}
        </span>
      </div>

      <form action={saveTelegramAlertSettings} className="telegram-main-form telegram-main-form-v5">
        <div className="telegram-config-grid">
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
            <input
              name="default_chat_id"
              defaultValue={telegram?.default_chat_id??''}
              placeholder="-100..."
              disabled={!canEdit}
            />
          </label>
          <label className="settings-field">
            <span>Retry khi gửi lỗi</span>
            <input
              name="retry_minutes"
              defaultValue={(telegram?.retry_minutes??[5,15,30,60]).join(', ')}
              placeholder="5, 15, 30, 60"
              disabled={!canEdit}
            />
          </label>
          <label className="settings-field compact">
            <span>Tối đa số lần thử</span>
            <input
              name="max_attempts"
              type="number"
              min="1"
              max="20"
              defaultValue={telegram?.max_attempts??5}
              disabled={!canEdit}
            />
          </label>
        </div>

        <div className="settings-actions settings-actions-v5">
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

      {canEdit&&<form action={testTelegramConnection} className="telegram-test-form">
        <label className="settings-field">
          <span>Chat ID test</span>
          <input name="chat_id" placeholder={telegram?.default_chat_id??'-100...'}/>
        </label>
        <button className="button" type="submit">Kiểm tra kết nối</button>
      </form>}
    </section>}

    {showTelegram&&<section className="settings-block settings-flat-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">ROUTING THEO HUB</span>
          <h3>Nhóm Telegram theo HUB</h3>
          <p>HUB không có route riêng sẽ dùng Chat ID mặc định.</p>
        </div>
        <span className="settings-mini-status">{destinations.filter(x=>x.is_active).length} route riêng</span>
      </div>

      <div className="telegram-destinations">
        {destinations.map(row=><form action={saveTelegramAlertDestination} className="telegram-destination-row" key={row.id}>
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
              <input
                type="checkbox"
                name="alert_types"
                value={value}
                defaultChecked={!row.alert_types?.length||row.alert_types.includes(value)}
                disabled={!canEdit}
              />
              <span>{label}</span>
            </label>)}
          </div>
          <label className="settings-check">
            <input type="checkbox" name="is_active" defaultChecked={row.is_active} disabled={!canEdit}/>
            <span>Bật</span>
          </label>
          {canEdit&&<div className="provider-row-actions">
            <button className="button small primary" type="submit">Lưu</button>
            <button className="button small danger" type="submit" formAction={deleteTelegramAlertDestination}>Xóa</button>
          </div>}
        </form>)}

        {canEdit&&<form action={saveTelegramAlertDestination} className="telegram-destination-row new">
          <label className="settings-field">
            <span>HUB mới</span>
            {hubs.length
              ? <select name="destination_hub" defaultValue="">
                  <option value="" disabled>Chọn HUB</option>
                  {hubs.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              : <input name="destination_hub" placeholder="Tạo HUB trước trong Kho đích & Shipper" required/>}
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
    </section>}
  </div>
}
