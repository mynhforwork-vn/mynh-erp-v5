'use client'

import {useEffect,useState} from 'react'

type NoticeKey='received'|'payment'|'combined'
type Notice={id:NoticeKey;title:string;detail:string}
const DEFINITIONS:Record<NoticeKey,Omit<Notice,'id'>>={
  received:{title:'Đã xác nhận nhận hàng',detail:'Đơn sẵn sàng cho luồng kho.'},
  payment:{title:'Đã ghi nhận đối soát HUB',detail:'Tip đã được tính tự động.'},
  combined:{title:'Đã xác nhận nhận hàng và chuyển ship',detail:'Đơn sẵn sàng cho luồng kho; đối soát HUB và tip đã được ghi nhận.'},
}

const noticeKeys=(received:boolean,payment:boolean):NoticeKey[]=>
  received&&payment?['combined']:received?['received']:payment?['payment']:[]

/** Non-blocking confirmation at the left; auto-dismiss in exactly 5s. */
export function TrackingSuccessToast({received=false,payment=false}:{received?:boolean;payment?:boolean}){
  const [visible,setVisible]=useState<NoticeKey[]>(()=>noticeKeys(received,payment))
  useEffect(()=>{
    // The same Tracking page can receive a new success redirect without a
    // full reload; update the toast stack whenever the flags change.
    setVisible(noticeKeys(received,payment))
    if(!received&&!payment)return
    // A one-time acknowledgement must not reappear after a reload/back navigation.
    const url=new URL(window.location.href)
    url.searchParams.delete('received')
    url.searchParams.delete('payment')
    window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
    const timer=window.setTimeout(()=>setVisible([]),5000)
    return ()=>window.clearTimeout(timer)
  },[received,payment])
  if(!visible.length)return null
  return <div className="tracking-success-toast-stack" aria-label="Thông báo thành công">
    {visible.map(id=><div key={id} className="tracking-success-toast" role="status" aria-live="polite">
      <span className="tracking-success-toast-mark" aria-hidden="true">✓</span>
      <div className="tracking-success-toast-content">
        <strong>{DEFINITIONS[id].title}</strong>
        <span>{DEFINITIONS[id].detail}</span>
      </div>
      <button type="button" className="tracking-success-toast-close"
        aria-label={'Đóng thông báo '+DEFINITIONS[id].title}
        onClick={()=>setVisible(curr=>curr.filter(k=>k!==id))}>×</button>
    </div>)}
  </div>
}
