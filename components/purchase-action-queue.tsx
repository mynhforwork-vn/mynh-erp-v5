'use client'

import Link from 'next/link'
import {useMemo,useState} from 'react'

export type PurchaseActionItem={
  id:string
  code:string
  detailHref:string
  detail:string
  status:string
  date:string
  priority:number
}
export type PurchaseActionGroup={
  id:string
  title:string
  hint:string
  tone:string
  priority:number
  count:number
}
export type PurchaseDataIssue={
  id:string
  code:string
  reason:string
  detailHref:string
}
type Props={
  groups:PurchaseActionGroup[]
  orders:PurchaseActionItem[]
  dataIssues:PurchaseDataIssue[]
  expressWithoutHub:PurchaseDataIssue[]
  missingGeoCount:number
  missingHubCount:number
  total:number
}

/** Các dòng ưu tiên cố định như main; CHỈ danh sách đơn bên dưới được cuộn. */
export function PurchaseActionQueue({groups,orders,dataIssues,expressWithoutHub,missingGeoCount,missingHubCount,total}:Props){
  const [selected,setSelected]=useState<string>('all')
  const selectedGroup=groups.find(x=>x.id===selected)
  const issueMode=selected==='data'||selected==='expressWithoutHub'
  const issueRows=selected==='data'?dataIssues:expressWithoutHub
  const shown=useMemo(()=>selectedGroup?orders.filter(o=>o.priority===selectedGroup.priority):selected==='all'?orders:[],[orders,selectedGroup,selected])
  const title=selectedGroup?.title??(selected==='data'?'Đơn cần bổ sung địa bàn':selected==='expressWithoutHub'?'Đơn Hỏa tốc không dùng HUB':'Đơn ưu tiên xử lý')
  function activate(id:string){setSelected(old=>old===id?'all':id)}
  return <div className="pd-action-panel" aria-labelledby="pd-action-heading">
    <header className="pd-side-head">
      <div><span className="module-eyebrow">ƯU TIÊN VẬN HÀNH</span>
        <h2 id="pd-action-heading">Công việc cần xử lý ngay</h2>
        <p>Chọn nhóm để xem toàn bộ đơn cần xử lý</p></div>
      <span className="pd-action-total">{total} <small>đơn</small></span>
    </header>
    <div className="pd-action-queue-body">
      <div className="pd-action-primary" role="group" aria-label="Ba nhóm công việc ưu tiên">
        {groups.slice(0,3).map(group=><button key={group.id} type="button"
          className={'action-queue-summary pd-action-'+group.tone+(selected===group.id?' is-active':'')}
          onClick={()=>activate(group.id)} aria-pressed={selected===group.id}
          title={'Xem '+group.count+' đơn: '+group.title}>
          <span className="pd-primary-count">{group.count}</span>
          <span className="pd-primary-name">{group.title}</span>
        </button>)}
      </div>
      <div className="pd-queue-secondary" role="group" aria-label="Nhóm vận hành tiếp theo">
        {groups.slice(3).map(group=><button key={group.id} type="button"
          className={'pd-queue-mini pd-action-'+group.tone+(selected===group.id?' is-active':'')}
          onClick={()=>activate(group.id)} aria-pressed={selected===group.id}
          title={'Xem '+group.count+' đơn: '+group.title}>
          <span>{group.title}</span><b>{group.count}</b>
        </button>)}
      </div>
      <div className="pd-action-order-heading">
        <strong>{title}</strong>
        <div className="pd-action-heading-right">
          <small>{issueMode?issueRows.length:shown.length} đơn</small>
          {selected!=='all'&&<button type="button" className="pd-action-viewall"
            onClick={()=>setSelected('all')}>Tất cả</button>}
        </div>
      </div>
      <div className="pd-action-orders-scroll" tabIndex={0} aria-label={'Danh sách '+title}>
        <div className="action-queue-orders">
          {issueMode?issueRows.map(issue=><Link href={issue.detailHref} key={issue.id} prefetch={false}>
            <div><b>{issue.code}</b><span>{issue.reason}</span></div>
            <span aria-hidden="true" className="pd-order-arrow">→</span>
          </Link>):shown.map(o=><Link href={o.detailHref} key={o.id} prefetch={false}>
            <div><b>{o.code}</b><span>{o.detail}</span></div>
            <div><span className={'pd-action-status'+(o.priority<=1?' is-urgent':'')}>{o.status}</span>
              <small>{o.date}</small></div>
          </Link>)}
          {(issueMode?issueRows.length===0:shown.length===0)&&
            <p className="pd-action-empty">Không có đơn trong nhóm này.</p>}
        </div>
      </div>
    </div>
    {(dataIssues.length>0||expressWithoutHub.length>0)&&<footer className="pd-quality-footer">
      {dataIssues.length>0&&<button type="button" className={'pd-quality-link'+(selected==='data'?' is-active':'')}
        onClick={()=>activate('data')} aria-pressed={selected==='data'}>
        <b>Thiếu dữ liệu địa bàn:</b> {missingGeoCount} đơn thiếu Phường/Xã hoặc tỉnh; {missingHubCount} đơn tiêu chuẩn đang/đã giao thiếu HUB đích <span aria-hidden="true">→</span>
      </button>}
      {expressWithoutHub.length>0&&<button type="button" className={'pd-quality-link pd-quality-neutral'+(selected==='expressWithoutHub'?' is-active':'')}
        onClick={()=>activate('expressWithoutHub')} aria-pressed={selected==='expressWithoutHub'}>
        {expressWithoutHub.length} đơn Hỏa tốc không áp dụng HUB đích · Xem đơn <span aria-hidden="true">→</span>
      </button>}
    </footer>}
  </div>
}
