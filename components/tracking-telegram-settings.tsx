import {
  deleteTelegramAlertDestination,
  saveTelegramAlertDestination,
  saveTelegramAlertSettings,
  testTelegramConnection,
} from '@/lib/actions/core'

type TelegramSettings={
  enabled:boolean;default_chat_id?:string|null;bot_token_secret_id?:string|null;alert_types?:string[]|null;
}
type Destination={
  id:string;destination_hub:string;chat_id:string;alert_types?:string[]|null;is_active:boolean;
}

const ALERTS=[
  ['ARRIVED_DESTINATION_HUB','Đến kho đích'],
  ['OUT_FOR_DELIVERY','Đang giao'],
  ['DELIVERED','Giao thành công'],
  ['DELIVERY_FAILED','Giao không thành công'],
] as const

export function TrackingTelegramSettings({
  telegram,
  destinations,
  hubs,
  canEdit,
  telegramTest,
  telegramMessage,
}:{
  telegram:TelegramSettings|null
  destinations:Destination[]
  hubs:string[]
  canEdit:boolean
  telegramTest?:string|null
  telegramMessage?:string|null
}){
  const enabledAlerts=new Set(telegram?.alert_types??ALERTS.map(x=>x[0]))
  return <div className="tracking-telegram-settings">
    {telegramTest==='ok'&&<div className="settings-result success">Telegram test: gửi thành công.</div>}
    {telegramTest==='fail'&&<div className="settings-result error">Telegram test thất bại: {telegramMessage||'Không xác định'}</div>}

    <section className="settings-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">TELEGRAM ALERTS</span>
          <h3>Bot & nhóm cảnh báo</h3>
          <p>Token được lưu trong Supabase Vault; trình duyệt chỉ biết trạng thái đã cấu hình hay chưa.</p>
        </div>
        <span className={'settings-mini-status '+(telegram?.enabled?'on':'')}>{telegram?.enabled?'Đang bật':'Đang tắt'}</span>
      </div>

      <form action={saveTelegramAlertSettings} className="telegram-main-form">
        <div className="telegram-config-grid">
          <label className="settings-field">
            <span>Bot Token</span>
            <input name="bot_token" type="password" placeholder={telegram?.bot_token_secret_id?'Đã lưu trong Vault · nhập để thay':'Nhập token từ BotFather'} disabled={!canEdit}/>
          </label>
          <label className="settings-field">
            <span>Chat ID mặc định</span>
            <input name="default_chat_id" defaultValue={telegram?.default_chat_id??''} placeholder="-100..." disabled={!canEdit}/>
          </label>
          <label className="settings-check"><input type="checkbox" name="enabled" defaultChecked={Boolean(telegram?.enabled)} disabled={!canEdit}/><span>Bật gửi Telegram</span></label>
          {canEdit&&telegram?.bot_token_secret_id&&<label className="settings-check subtle"><input type="checkbox" name="clear_token"/><span>Xóa Bot Token</span></label>}
        </div>

        <div className="telegram-alert-types">
          {ALERTS.map(([value,label])=><label className="settings-check" key={value}>
            <input type="checkbox" name="alert_types" value={value} defaultChecked={enabledAlerts.has(value)} disabled={!canEdit}/>
            <span>{label}</span>
          </label>)}
        </div>

        {canEdit&&<div className="settings-actions">
          <button className="button primary" type="submit">Lưu Telegram</button>
        </div>}
      </form>

      {canEdit&&<form action={testTelegramConnection} className="telegram-test-form">
        <label className="settings-field">
          <span>Chat ID test (để trống dùng mặc định)</span>
          <input name="chat_id" placeholder={telegram?.default_chat_id??'-100...'}/>
        </label>
        <button className="button" type="submit">Gửi tin nhắn thử</button>
      </form>}
    </section>

    <section className="settings-block">
      <div className="settings-block-head">
        <div>
          <span className="module-eyebrow">THEO HUB</span>
          <h3>Nhóm Telegram theo HUB</h3>
          <p>Nếu HUB không có cấu hình riêng, hệ thống dùng Chat ID mặc định.</p>
        </div>
        <span className="settings-mini-status">{destinations.filter(x=>x.is_active).length} HUB có nhóm riêng</span>
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
              <input type="checkbox" name="alert_types" value={value} defaultChecked={!row.alert_types?.length||row.alert_types.includes(value)} disabled={!canEdit}/>
              <span>{label}</span>
            </label>)}
          </div>
          <label className="settings-check"><input type="checkbox" name="is_active" defaultChecked={row.is_active} disabled={!canEdit}/><span>Bật</span></label>
          {canEdit&&<div className="provider-row-actions">
            <button className="button small primary" type="submit">Lưu</button>
            <button className="button small danger" type="submit" formAction={deleteTelegramAlertDestination}>Xóa</button>
          </div>}
        </form>)}

        {canEdit&&<form action={saveTelegramAlertDestination} className="telegram-destination-row new">
          <label className="settings-field">
            <span>HUB mới</span>
            {hubs.length
              ? <select name="destination_hub" defaultValue=""><option value="" disabled>Chọn HUB</option>{hubs.map(h=><option key={h} value={h}>{h}</option>)}</select>
              : <input name="destination_hub" placeholder="Tạo HUB trước trong SPX · Kho đích" required/>}
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
          <label className="settings-check"><input type="checkbox" name="is_active" defaultChecked/><span>Bật</span></label>
          <button className="button small primary" type="submit">+ Thêm nhóm HUB</button>
        </form>}
      </div>
    </section>
  </div>
}
