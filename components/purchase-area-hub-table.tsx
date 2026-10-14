'use client'

import {useState} from 'react'
import type {InsightCount} from '@/lib/purchase-dashboard-insights'

type Group='area'|'hub'

/** Hai cách phân nhóm chung bốn cột trạng thái, cùng phạm vi ngày đặt đơn. */
export function PurchaseAreaHubTable({areaGroups,hubGroups}:{
  areaGroups:InsightCount[]
  hubGroups:InsightCount[]
}){
  const [mode,setMode]=useState<Group>('area')
  const groups=mode==='area'?areaGroups:hubGroups
  const heading=mode==='area'?'Phường/Xã · Tỉnh/TP':'HUB đích'
  return <>
    <div className="pd-summary-tabs" role="tablist" aria-label="Phân loại bảng tổng hợp">
      <button type="button" role="tab" id="pd-tab-area" aria-selected={mode==='area'}
        aria-controls="pd-summary-tabpanel" className={mode==='area'?'is-selected':''}
        onClick={()=>setMode('area')}>Phường/Xã <small>{areaGroups.length}</small></button>
      <button type="button" role="tab" id="pd-tab-hub" aria-selected={mode==='hub'}
        aria-controls="pd-summary-tabpanel" className={mode==='hub'?'is-selected':''}
        onClick={()=>setMode('hub')}>HUB đích <small>{hubGroups.length}</small></button>
    </div>
    <div className="pd-table-head">
      <table className="pd-table pd-summary-head-table" aria-label={'Tiêu đề bảng '+heading}>
        <colgroup><col className="pd-area-col"/><col/><col/><col/><col/></colgroup>
        <thead><tr><th scope="col">{heading}</th><th scope="col">Chờ MVĐ</th>
          <th scope="col">Vận chuyển</th><th scope="col">Giao TC</th>
          <th scope="col">Đơn bị huỷ</th></tr></thead>
      </table>
    </div>
    <div key={mode} id="pd-summary-tabpanel" role="tabpanel"
      aria-labelledby={mode==='area'?'pd-tab-area':'pd-tab-hub'}
      className="pd-table-scroll" tabIndex={0}
      aria-label={'Danh sách số liệu theo '+heading}>
      <table className="pd-table pd-status-table" aria-label={'Số đơn theo '+heading}>
        <colgroup><col className="pd-area-col"/><col/><col/><col/><col/></colgroup>
        <tbody>
          {groups.length===0&&<tr><td colSpan={5} className="pd-empty">Chưa có đơn trong khoảng lọc.</td></tr>}
          {groups.map(group=><tr key={mode+'-'+group.name}>
            <th scope="row" title={group.name}>{group.name}</th>
            <td className="pd-cell-warning">{group.missing}</td>
            <td className="pd-cell-blue">{group.shipping}</td>
            <td className="pd-cell-green">{group.delivered}</td>
            <td className="pd-cell-cancelled">{group.cancelled}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>
}
