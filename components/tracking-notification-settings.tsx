'use client'

import { saveAlertRuleConfig } from '@/lib/actions/core'

type AlertRule={
  alert_type:string
  label:string
  enabled:boolean
  in_app_enabled:boolean
  batch_window_minutes:number
  sort_order:number
}

export function TrackingNotificationSettings({rules,canEdit}:{
  rules:AlertRule[]
  canEdit:boolean
}){
  const sortedRules=[...rules].sort((a,b)=>a.sort_order-b.sort_order)
  const enabledRules=sortedRules.filter(rule=>rule.enabled).length
  const inAppRules=sortedRules.filter(rule=>rule.enabled&&rule.in_app_enabled).length

  return <div className="notification-settings-v9 notification-in-app-only-v1">
    <section className="notification-full-panel-v9">
      <div className="notification-panel-head-v9">
        <div>
          <h3>Quy tắc thông báo trong ứng dụng</h3>
          <p>Bật/tắt từng cảnh báo vận chuyển và thời gian gom thông báo; không ảnh hưởng đến Tracking.</p>
        </div>
        <span>{enabledRules}/{sortedRules.length} cảnh báo · {inAppRules} hiển thị</span>
      </div>

      <div className="notification-rule-scroll-v9">
        <div className="notification-rule-table-v9">
          <div className="notification-rule-head-v9" aria-hidden="true">
            <span>Cảnh báo</span>
            <span>Kích hoạt</span>
            <span>Trong ứng dụng</span>
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
              <input type="checkbox" name="enabled" defaultChecked={rule.enabled} disabled={!canEdit} aria-label={'Kích hoạt '+rule.label}/>
              <span>Kích hoạt: {rule.enabled?'Bật':'Tắt'}</span>
            </label>
            <label className="notification-toggle-v9">
              <input type="checkbox" name="in_app_enabled" defaultChecked={rule.in_app_enabled} disabled={!canEdit} aria-label={'Hiển thị trong ứng dụng: '+rule.label}/>
              <span>Trong ứng dụng: {rule.in_app_enabled?'Bật':'Tắt'}</span>
            </label>
            <label className="notification-batch-v9">
              <input name="batch_window_minutes" type="number" min="0" max="60" step="1" defaultValue={rule.batch_window_minutes} disabled={!canEdit} aria-label={'Phút gom thông báo: '+rule.label}/>
              <span>phút</span>
            </label>
            {canEdit?<button className="button small" type="submit">Lưu</button>:<span/>}
          </form>)}
          {!sortedRules.length&&<div className="notification-empty-v1">Chưa có quy tắc cảnh báo được cấu hình.</div>}
        </div>
      </div>
      <div className="notification-footnote-v9">
        <b>Thông báo nội bộ</b>
        <span>Các cảnh báo và lịch sử thông báo trong ứng dụng vẫn được giữ nguyên. Chỉ thay đổi kênh hiển thị và quy tắc gom.</span>
      </div>
    </section>
  </div>
}
