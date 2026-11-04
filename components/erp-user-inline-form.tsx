'use client'

import {useActionState,useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useRouter} from 'next/navigation'
import {submitERPUserInline,type ERPUserInlineResult} from '@/lib/actions/core'
import type {ReactNode} from 'react'

const initial:ERPUserInlineResult={status:'idle',href:'',message:''}
type Operation='create'|'update'|'archive'|'restore'|'archiveBulk'|'restoreBulk'
export const ERP_USER_ACTION_EVENT='mynh-erp-user-action'
export type ERPUserActionFeedback={
  status:'ok'|'error'
  message:string
  operation:Operation
  userIds:string[]
}

/** Page-level toast survives unmounting the bulk form when processed rows disappear. */
export function ERPUserActionToast(){
  const [ready,setReady]=useState(false)
  const [feedback,setFeedback]=useState<ERPUserActionFeedback|null>(null)
  useEffect(()=>{
    setReady(true)
    const onAction=(event:Event)=>{
      const detail=(event as CustomEvent<ERPUserActionFeedback>).detail
      if(detail&&(detail.status==='ok'||detail.status==='error')){
        setFeedback(detail)
      }
    }
    window.addEventListener(ERP_USER_ACTION_EVENT,onAction)
    return ()=>window.removeEventListener(ERP_USER_ACTION_EVENT,onAction)
  },[])
  useEffect(()=>{
    if(!feedback)return
    const timeout=window.setTimeout(()=>setFeedback(null),5000)
    return ()=>window.clearTimeout(timeout)
  },[feedback])
  if(!ready||!feedback)return null
  return createPortal(
    <div className={'erp-user-action-toast '+(feedback.status==='ok'?'is-success':'is-error')}
      role={feedback.status==='error'?'alert':'status'} aria-live={feedback.status==='error'?'assertive':'polite'}>
      <span>{feedback.message}</span>
      <button type="button" aria-label="Đóng thông báo" onClick={()=>setFeedback(null)}>×</button>
    </div>,
    document.body
  )
}

/** Retain table scroll and navigation state; no blocking inline error in the filter bar. */
export function ERPUserInlineForm({operation,children,className=''}:{
  operation:Operation
  children:ReactNode
  className?:string
}){
  const router=useRouter()
  const [state,submit,pending]=useActionState(submitERPUserInline,initial)
  const handled=useRef<ERPUserInlineResult|null>(null)
  const submittedUserIds=useRef<string[]>([])

  useEffect(()=>{
    if(state.status==='idle'||handled.current===state)return
    handled.current=state
    const feedback:ERPUserActionFeedback={
      status:state.status,
      message:state.message,
      operation,
      userIds:submittedUserIds.current,
    }
    window.dispatchEvent(new CustomEvent<ERPUserActionFeedback>(ERP_USER_ACTION_EVENT,{detail:feedback}))
    if(state.status!=='ok'||!state.href)return

    // Preserve table scroll; rows are hidden locally only after a confirmed success.
    if(state.href.startsWith('/purchase/accounts')){
      const card=document.querySelector('.account-table-card')
      if(card){
        try{sessionStorage.setItem('mynh-account-scroll-on-save',JSON.stringify({
          x:card.scrollLeft,y:card.scrollTop,at:Date.now(),
        }))}catch{}
      }
    }
    const current=window.location.pathname+window.location.search
    if(current===state.href)router.refresh()
    else router.replace(state.href,{scroll:false})
  },[router,state,operation])

  return <form className={className} action={submit} aria-busy={pending}
    onSubmit={event=>{
      if(pending){event.preventDefault();return}
      const data=new FormData(event.currentTarget)
      submittedUserIds.current=[...new Set([
        ...data.getAll('user_ids').map(String),
        String(data.get('user_id')??''),
      ].filter(Boolean))]
    }}>
    <input type="hidden" name="inline_operation" value={operation}/>
    {children}
    {pending&&<span className="erp-user-inline-pending" role="status">Đang lưu thay đổi…</span>}
  </form>
}
