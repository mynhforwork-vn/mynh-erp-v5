'use client'

import { useState } from 'react'

type SyncPayload={
  error?:string
  detail?:string|null
  result?:{event_count?:number;ok?:boolean}
}

export function ManualSyncButton({shipmentId,iconOnly=false}:{shipmentId:string,iconOnly?:boolean}){
  const [state,setState]=useState<'idle'|'busy'|'ok'|'error'>('idle')
  const [msg,setMsg]=useState('')

  async function sync(){
    setState('busy')
    setMsg('')

    try{
      const response=await fetch('/api/tracking/manual',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({shipment_id:shipmentId}),
      })

      const raw=await response.text()
      let data:SyncPayload={}
      if(raw){
        try{data=JSON.parse(raw) as SyncPayload}
        catch{data={error:`Phản hồi Tracking không hợp lệ (HTTP ${response.status})`}}
      }

      if(!response.ok){
        throw new Error(data.error??`Đồng bộ thất bại (HTTP ${response.status})`)
      }

      setState('ok')
      setMsg(`Đã đồng bộ${data.result?.event_count!=null?` · ${data.result.event_count} sự kiện`:''}`)
      setTimeout(()=>location.reload(),600)
    }catch(error){
      setState('error')
      setMsg(error instanceof Error?error.message:'Đồng bộ thất bại')
    }
  }

  const busy=state==='busy'
  const label=busy?'Đang đồng bộ vận chuyển':state==='error'?'Thử đồng bộ vận chuyển lại':'Đồng bộ vận chuyển'
  return <div className={'inline-action'+(iconOnly?' tracking-sync-icon-wrap':'')}>
    <button
      type="button"
      className={iconOnly?'tracking-sync-icon-button':'button small'}
      onClick={sync}
      disabled={busy}
      aria-label={label}
      title={state==='error'&&msg?label+' — '+msg:label}
    >
      {iconOnly
        ?<svg className={busy?'tracking-sync-icon rotating':'tracking-sync-icon'}
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <path d="M20 7v5h-5"/>
          <path d="M4 17v-5h5"/>
          <path d="M5.7 9A7.5 7.5 0 0 1 18.6 6.7L20 12"/>
          <path d="M4 12l1.4 5.3A7.5 7.5 0 0 0 18.3 15"/>
        </svg>
        :busy?'Đang đồng bộ…':'↻ Đồng bộ vận chuyển'}
    </button>
    {msg&&<span role={state==='error'?'alert':'status'}
      className={(state==='error'?'error-text':'success-text')+(iconOnly?' tracking-sync-feedback':'')}>{msg}</span>}
  </div>
}
