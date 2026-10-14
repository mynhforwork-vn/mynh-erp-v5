'use client'

import {useActionState,useEffect,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {submitERPUserInline,type ERPUserInlineResult} from '@/lib/actions/core'
import type {ReactNode} from 'react'

const initial:ERPUserInlineResult={status:'idle',href:'',message:''}
type Operation='create'|'update'|'archive'|'restore'|'archiveBulk'|'restoreBulk'

/** Giữ nguyên vị trí trang/bảng trong khi ghi dữ liệu User. */
export function ERPUserInlineForm({operation,children,className=''}:{
  operation:Operation
  children:ReactNode
  className?:string
}){
  const router=useRouter()
  const [state,submit,pending]=useActionState(submitERPUserInline,initial)
  const navigated=useRef('')
  useEffect(()=>{
    if(state.status!=='ok'||!state.href||navigated.current===state.href)return
    navigated.current=state.href
    // Lưu vị trí bảng ngay trước chuyển ngữ cảnh panel để RSC cập nhật
    // dữ liệu mà không đưa người dùng về đầu bảng sau thao tác.
    if(state.href.startsWith('/purchase/accounts')){
      const card=document.querySelector('.account-table-card')
      if(card){
        try{sessionStorage.setItem('mynh-account-scroll-on-save',JSON.stringify({
          x:card.scrollLeft,y:card.scrollTop,at:Date.now(),
        }))}catch{}
      }
    }
    // Điều hướng client-side; tuyệt đối không location.href / reload().
    router.replace(state.href,{scroll:false})
  },[router,state])
  return <form className={className} action={submit} aria-busy={pending}
    onSubmit={event=>{if(pending)event.preventDefault()}}>
    <input type="hidden" name="inline_operation" value={operation}/>
    {children}
    {state.status==='error'&&<p className="erp-user-inline-error" role="alert">{state.message}</p>}
    {pending&&<span className="erp-user-inline-pending" role="status">Đang lưu thay đổi…</span>}
  </form>
}
