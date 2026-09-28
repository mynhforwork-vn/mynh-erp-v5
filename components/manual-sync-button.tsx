'use client'
import { useState } from 'react'
export function ManualSyncButton({shipmentId}:{shipmentId:string}){
 const [state,setState]=useState<'idle'|'busy'|'ok'|'error'>('idle')
 const [msg,setMsg]=useState('')
 async function sync(){setState('busy');setMsg('');try{const r=await fetch('/api/tracking/manual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shipment_id:shipmentId})});const j=await r.json();if(!r.ok)throw new Error(j.error??'Đồng bộ thất bại');setState('ok');setMsg(`Đã đồng bộ${j.result?.event_count!=null?` · ${j.result.event_count} sự kiện`:''}`);setTimeout(()=>location.reload(),500)}catch(e){setState('error');setMsg(e instanceof Error?e.message:'Đồng bộ thất bại')}}
 return <div className="inline-action"><button className="button small" onClick={sync} disabled={state==='busy'}>{state==='busy'?'Đang đồng bộ…':'↻ Đồng bộ vận chuyển'}</button>{msg&&<span className={state==='error'?'error-text':'success-text'}>{msg}</span>}</div>
}
