'use client'

import { useState } from 'react'

type SyncPayload={
  error?:string
  detail?:string|null
  result?:{event_count?:number;ok?:boolean}
}

export function ManualSyncButton({shipmentId}:{shipmentId:string}){
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

  return <div className="inline-action">
    <button className="button small" onClick={sync} disabled={state==='busy'}>
      {state==='busy'?'Đang đồng bộ…':'↻ Đồng bộ vận chuyển'}
    </button>
    {msg&&<span className={state==='error'?'error-text':'success-text'}>{msg}</span>}
  </div>
}
